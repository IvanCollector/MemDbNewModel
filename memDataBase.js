'use strict';

var _dbgTranLog = true; // трассировка в консоль старта/коммита транзакций

class MemDataBase {

	constructor(controller, parentDbGuid, params) {

		this._controller = controller;
		this._parentDbGuid = parentDbGuid;
		this._dbGuid = guid();
		this._version = 1;
		this._roots = {};
		// транзакции
		this._curTranGuid = undefined;
		this._readOnlyMode = true;
		this._calls = [];
		this._nportion = 0;
		// очередь вызовов в транзакциях
		this._queue = [];		
		this._isLog = true;	// логировать изменения в бд

		controller._regMemDb(this);	

		if (params) this._name = params.name;
		
		// DbPromises
		this._nprom=0; 		// счетчик промисов
		this._p = [];
		this._dbgPromises = [];
	}
	

	_incPromise(p){
		// this._p.push(p);
		return ++this._nprom;
	}

	
	// добавить мастер рут с данными data
	addMasterRoot(data, params) {

		if (!this._curTranGuid) throw new Error("нельзя выполнить addMasterRoot: транзакция не открыта");
		if (this.isReadOnly()) throw new Error("нельзя выполнить addMasterRoot: база данных в режиме ReadOnly");

		var r = new RootDb(this,data,undefined,undefined,params);	
		return r;
	}
	
	getController() {
		return this._controller;
	}
	
	// вернуть гуид базы данных
	getGuid() {
		return this._dbGuid;
	}
	
	// вернуть гуид родительской базы данных
	getParentGuid() {
		return this._parentDbGuid;
	}
	
	getRootGuids() {
		return Object.keys(this._roots);
	}
	
	// вернуть рут базы данных по его гуиду
	getRoot(guid) {
		return this._roots[guid];
	}
	
	// вернуть версию базы
	getVersion() {
		return this._version;
	}

	isReadOnly() {
		return this._readOnlyMode;
	}
	
	_setReadOnly(val) {
		if (val)
			this._readOnlyMode = true;
		else
			this._readOnlyMode = false;
	}
	
	// Методы управления транзакцией

	start(testTran) {
		if (this._curTranGuid) 
			throw new Error("can't start transaction because it's running")
	
		if (!this._curTranGuid) {
			this._setReadOnly(false);
			if (testTran)
				this._curTranGuid = testTran;
			else
				this._curTranGuid = guid();
			if (_dbgTranLog)  console.log("TRANLOG START ",this._name," :",this._curTranGuid);
		}
	}

	// стартовать внешнюю транзакцию с гуидом guid
	// sourceGuid - гуид ДБ-источника транзакции
	_startExternal(extGuid, sourceGuid) {
		if (this.inTran() && extGuid != this._curTranGuid)
			throw new Error("can't start external transaction")
		this._setReadOnly(false);
		
		if (!this._curTranGuid) {
			this._curTranGuid = extGuid;
			this._curTranExt = true;
			this._curTranSrc = sourceGuid;
			
			if (_dbgTranLog) console.log("TRANLOG EXTSTART ",this._name," :",this._curTranGuid);
		}		
	}
	
	_clearTran() {	
		delete this._promises[this._curTranGuid];
		this._curTranGuid = undefined;
		this._curTranExt = undefined;
		this._curTranSrc = undefined;
		this._nportion = 0;
	}
	
	_getAllSubs() {
		var allSubs = {};
		for (var g in this._roots) 
			for (var g2 in this._roots[g]._subscribers) 
				allSubs[g2] = 1;
		return allSubs;
	}
	
	commit(res){
	
		function fcommit() {
			var subs = that._getAllSubs();			

			for (var g in subs) 
				if (!(that._curTranExt && g == that._curTranSrc))
					that._callChild(g,that._curTranGuid, undefined,1);
			if (_dbgTranLog) console.log("TRANLOG COMMIT ",that._name," :",that._curTranGuid);
			that._clearTran();
			that._setReadOnly(true);
		}
	
		if (!this._curTranGuid || this._readOnlyMode) 
			throw new Error("can't commit Database: "+this._name);	

		var that = this;
		var fromParent = this._curTranExt && (this._curTranSrc === this.getParentGuid());

		if (this.getParentGuid() && !fromParent) {	// коммит требует предварительного коммита парента
				return this._remoteClient(true,true).then( function (res1) {			
					fcommit();					
					return res;
				});
			}
		else {		
			fcommit();
			return res;
		}
	}

	inTran() {
		return (this._curTranGuid!=undefined);
	}

	getTranGuid() {
		return this._curTranGuid;
	}
	
	isLogActive() {
		return this._isLog;
	}

	// очередь
	// fn - возвращает промис
	_toQueue(fn, tran) {
		var that = this;
		function resolveNext() {
			// поставить следующий из очереди ГДЕ КОММИТИТСЯ ТРАНЗАКЦИЯ?
			if (that.getTranGuid()) { // если транзакция еще открыта, то не ищем в очереди
				for (var i=0; i<that._queue.length; i++) {
					if (that.getTranGuid() == that._queue[i].tran) {
						var qelem2 = that._queue[i];
						that._queue.splice(i,1); // удаляем отработанный элемент очереди
						return qelem2.fn().then(function(res2) {
							qelem2.fresolve(res2);
						});						
					}
				}
				return;
			}
				
			if (that._queue.length>0) {
				var qelem2 = that._queue[0];
				that._queue.splice(0,1); // удаляем отработанный элемент очереди
				return qelem2.fn().then(function(res2) {
					qelem2.fresolve(res2);
				});
			}
		}		
		return new Promise(function(resolve,reject) {
			if (that.getTranGuid() && (that.getTranGuid() !== tran)) { // если в другой транзакции, то ставим в очередь
				that._queue.push({ fn: fn, tran: tran, fresolve: function(res) { resolve(res); resolveNext(); }  });
				//console.log("%c # PUSH TO QUEUE ","color:blue",that._name,"  ", that._curTranGuid /*, " ", fn*/);
			}
			else {// если в этой или без транзакции, то выполняем
				//console.log("%c # EXEC IN QUEUE ","color:blue",that._name,"  ", that._curTranGuid /*, " ", fn*/);
				fn().then(function(res) { 
					var x = that._name;
					resolve(res); 
					resolveNext(); });
			}
		});
	}
	
	_remoteClientPromise(packet) {
		var that = this;
		if (packet.calls.length>0)
			this._setReadOnly(true);  // в режим ридонли пока от парента не вернется ответ (если CALL)
			
		return that.getController()._prc(function() {
			return new Promise(function(resolve,reject) {	
				//var parent = that.getController().getDb(that.getParentGuid());
				//var p = parent._remoteParent(packet);
				var p = that.getController()._remoteParent(that.getParentGuid(),packet);
				
				p.then( function(res) {
					if (that.isReadOnly())that._setReadOnly(false); // выйти из ридонли пока обработка колбэков
					if (packet.calls.length>0) { // todo переделать на N элементов
						var arg = { calls: [ { fn: function() { return packet.calls[0].resolve(res.results[0]); }  }] }
						arg.tran = packet.tran;
						return that._exec(arg,"remoteClientPromise");
					}
				}).then(function(res) {
					resolve(res);
				});	
			});
		}); 
	}
	
	_remoteClient(async, commit, deltas) {

		if (!this.inTran()) 
			throw new Error("can't exec a remote call: database is not in transaction");	
		if (!commit && this.isReadOnly()) 
			throw new Error("can't exec a remote call: database is in readonly mode");

		var that = this;
		// создать пакет транзакции удаленного вызова и передать его паренту
		var packet = { 
			db : this.getGuid(),
			tran : this.getTranGuid(),	
			async : async ? 1 : 0,			// вызов асинхронный или синхронный
			commit : commit ? 1 : 0,		// коммитить транзакцию или нет
			deltas : [],					// массив дельт
			calls : []						// массив удаленных вызовов
		};

		if (deltas!==undefined) {
			packet.deltas = deltas;
		}
		else {
			for (var rg in this._roots) {		// сгенерировать дельты
				var root = this._roots[rg];
				var d = root._genDelta();
				if (d) packet.deltas.push(d);
			}	
		}
		if (this._calls.length>0) {
			packet.calls = this._calls.slice(0,this._calls.length);
		}
		// todo ВРЕМЕННО
		this._calls = [];		

		return this._remoteClientPromise(packet);
	}	
	
	_execChild(packet) {
		var that = this;
		//console.log("%c ## EXEC REMOTE CHILD ","color:blue",that._name," ",packet.tran," COMMIT: ",packet.commit,packet);
		return this._toQueue(function() {
			return new Promise (function(resolve,reject) {
				//setTimeout(function() {
					that._execChild2.apply(that, [packet]);
					resolve();
				//},0);
			});
		}, packet.tran);
	}
	
	_execChild2(packet) {

		//console.log("%c @@ __EXEC ","color:black",this._name,"EXECCHILD"," ",packet.tran," COMMIT: ",packet.commit,packet);
		this._startExternal(packet.tran, packet.db);
		
		var deltas = packet.deltas ? packet.deltas : [];
		this._applyDeltas(deltas);							// применить дельты на данной БД

		this._propDeltas("subs", deltas, packet.db);	// разослать дельты подписчикам
		
		if (packet.commit)
			this.commit();		
	}
	
	_callChild(dbGuid, tran, deltas, commit) {	
	
		if (!tran)
			throw new Error("can't call child: database is not in transaction ");
			
		var packet = { 
			db : this.getGuid(),
			tran : tran,
			async : 1,						// вызов асинхронный или синхронный
			commit : commit ? 1 : 0,		// коммитить транзакцию или нет
			deltas : deltas,				// массив дельт
			calls : []						// массив удаленных вызовов
		};		
		//var db = this.getController().getDb(dbGuid);
		var that = this;
		this.getController()._crc(function() {
			//db._execChild(packet);
			that.getController()._callChild(dbGuid,packet);
		});			
	}
	
	_remoteParent(packet) {
		var that = this;
		//console.log("%c ## EXEC REMOTE PARENT ","color:red",that._name," ",packet.tran," COMMIT: ",packet.commit,packet);

		return this._toQueue(function() {
			that._startExternal(packet.tran, packet.db);
		
			return that._exec(packet,"remoteParent")
			.then(function(res) {
				if (packet.commit)
					return that.commit(res);
				else return res;
			})
			.then(function(res) {
				return new Promise( function(resolve,reject) {
					//setTimeout( function() {				
					//	resolve(res);
					that.getController()._crc(function() { resolve(res); });
					//},0);
				});		
			});
		}, packet.tran);
	}

	run(userFunc,testTran) {
		var that = this;
		
		return this._toQueue(function() {
			that.start(testTran);
			//console.log("START!",that._name, that._curTranGuid, that._queue.length, xxx);
			var p =  that._exec( {calls: [{ fn: userFunc }], tran: that.getTranGuid() }, "run")
			.then(function(res) { 
				return that.commit(); 
			});		
			return p;	
		}, undefined);
	}

	_onResolvePromise(val,result,num,tran) {
		var that=this;
		if (val==0) {
			if (that._fresolveUserCode) {
				that._fresolveUserCode(result);
				delete that._fresolveUserCode;
			}
			else
				throw new Error("can't resolve in _onResolvePromise : ", this._name);
		}
			//setTimeout(function() { that._fresolveAndGo(result); },0);
	}
			
			
	_exec(packet,dbgInfo) {
		var that = this, funcresult = null;
		//if (packet.deltas && packet.deltas.length>0 && packet.commit)
		//	console.log("FFFFFFFFFFFFFFFFFFFFFFFFFFF");
		if (packet.tran != this.getTranGuid())
			throw new Error("can't execute packet: wrong transaction db:",this.getTranGuid(),"packet ",packet.tran,packet );
		
		console.log("%c @@ __EXEC ","color:black",that._name,dbgInfo," ",packet.tran," COMMIT: ",packet.commit,packet);

		var deltas = packet.deltas ? packet.deltas : [];
		if (deltas.length>0) {
			for (var i=0, dnew = []; i<deltas.length; i++) {
				var d = this.getRoot(packet.deltas[i].guid);
				if (d && !d.isMaster()) 
					dnew.push(deltas[i]); 				// если рут - не мастер, то надо запомнить его, чтобы послать дельту паренту
			}	
			if (dnew.length>0) 
				this._remoteClient(true,false,dnew); 	// отправить дельты паренту
				
			this._applyDeltas(deltas);					// применить дельты на данной БД	
			
			this._propDeltas("subs", deltas,packet.db);	// разослать дельты подписчикам
		}
		
		var rc = packet.calls[0], p;
		if (rc) {
			if (rc.fn) {	// client	

				p = new DbPromise(this, function(resolve,reject) {
					resolve();
				}).then(function() {
					that._nportion++;
					return rc.fn();
				});
			}
			else		// server
				p = that._genericExec(rc.name,rc.arg);
	
			var p2 = new Promise(function(resolve,reject) {
					that._fresolveUserCode = resolve;
				});
						
			return p2.then( function(res) {
				var ds = that._genSendDeltas();					// сгенерировать и разослать дельты после выполнения методов
				if (that.getParentGuid() && (ds.length>0 || that._calls.length>0) )
					return that._remoteClient(true,false,ds).then(function(res1) {
						return res; 
					});
				else 
					return res;
			});	

		}
		else
			return new Promise(function(resolve,reject) { resolve(); });
	}

	_genericRemoteCall(name, argObj) {
		if (!this.inTran()) 
			throw new Error("can't call "+name+": database isn't in transaction");	
		if (this.isReadOnly()) 
			throw new Error("can't call "+name+": database is in readonly mode");

		var that = this;
		return new Promise(function(resolve, reject) {
				var o = { name: name, arg: argObj, resolve: function(res) { resolve(res); }}
				that._calls.push(o);
		});	
	}	
	
	_genericExec(name, argObj) {
		if (!this.inTran()) throw new Error("can't execute "+name+": database is not in transaction");	
		if (this.isReadOnly()) throw new Error("can't execute "+name+": database is in readonly mode");
		var that = this;
		return new DbPromise(this,function(resolve,reject) {
			resolve();
		})
		.then(function(res) {
			return that[name](argObj);
		})
		.then(function(res) {
			return { results: [res] };
		});
		
	}

	// подписать на руты родительской базы. Руты приходят в виде дельт
	// и применяются к базе до того, как отрабатывает обработчик промис
	// rootGuids - массив гуидов рутов
	// возвращает промис с массивом ссылок на руты (объекты)

	subscribeRoots(rootGuids) {
		var that = this;
		var p = this._genericRemoteCall("_subscribeRootsParentSide",  { subDbGuid: this.getGuid(), rootGuids: rootGuids });
		return p.then(function(res) {
			var resRoots = [];
			for (var i=0; i<res.length; i++) {
				resRoots.push(that.getRoot(res[i]));
			}			
			return resRoots;
		});
	}
	
	_subscribeRootsParentSide(objsub) {

		var subDbGuid = objsub.subDbGuid, rootGuids = objsub.rootGuids;
		var res = [];

		for (var i=0; i<rootGuids.length; i++) {
			var root = this.getRoot(rootGuids[i]);
			res.push(root);
			root._subscribe(subDbGuid);
		}
		return rootGuids;		
	}

	testSetParElem(rootGuid,idx,value) {
		var that = this;
		var p = this._genericRemoteCall("_testSetParElemParentSide",  { rootGuid: rootGuid.getGuid(), idx:idx, value:value });
		return p.then(function(res) {
			return that.getRoot(res);
		});
	}

	_testSetParElemParentSide(obj) {
		var root = this.getRoot(obj.rootGuid);
		root.setData(obj.idx,obj.value,this.getTranGuid());		
		return obj.rootGuid;		
	}
	
	// применить дельты к бд,
	// deltas - массив дельт, одна дельта = один рут
	_applyDeltas(deltas) {
		//console.log("memDB._applyDeltas "+this._name, deltas);	
		
		if (!this.inTran())
			throw new Error("Can't apply deltas without transaction");
			
		var tr = this.getTranGuid();
		this._isLog = false;
		for (var i=0; i<deltas.length; i++) {
			var d = deltas[i];
			if (d.add) { // дельта с новым рутом
				var r = new RootDb(this, d.data, d.guid, d.version, {name: d.name+"__in__"+this._name});
			}
			if (d.mod) {
				// применить новые значения дельты
				var root = this.getRoot(d.guid);
				for (var idx in d.data) {
					root.setData(idx,d.data[idx], tr, true);
				}
			}
		}
		this._isLog = true;
	}

	// послать deltas, которые сгенерированны для db подписчикам
	_newSendDeltas(data) {
		var that = this;
		//console.log("newsenddelta ",this._curTranGuid);
		var memTran = this._curTranGuid;
		
		//setTimeout( function() { 
			for (var dbGuid in data)
				that._callChild(dbGuid,memTran,data[dbGuid],0);
		//}, 0);	

	}
	
	// сгенерировать и послать все дельты для данной бд
	_genSendDeltas() {
		//console.log("MemDb._genSendDeltas "+this._name);

		var allSubs = {}; // гуиды всех подписчиков
		var ds = [];
		for (var rg in this._roots) {
			var root = this._roots[rg];
			var d = root._genDelta();
			if (!root.isMaster() && d ) {
				ds.push(d);	// массив дельт для парента
			}
			var newSubs = root._getLog()._getNewSubscribersGuids();
			root._getLog()._newSubsGuids = [];
			if (newSubs.length>0) { 		// создаем сериализованное представление рута для отсылки новому подписчику
				var d_add = root.serialize();
				d_add.add = 1;
			}

			for (var subs in root._subscribers) { // todo refact инкапсулировать
				if (newSubs.indexOf(subs)!=-1) 
					var gd = d_add;
				else 
					gd = d;
				if (gd) {
					if (!(subs in allSubs)) allSubs[subs]=[];
					allSubs[subs].push(gd);
				}
			}
		}		
		// отправить дельты	

		this._newSendDeltas(allSubs); 
		return ds;
	}

	// разослать deltas, которые сгенерированны для db подписчикам
	// direction - "subs" - послать подписчикам "parent" - послать родительской бд, "all" - послать всем
	// deltas - массив дельт
	// srcGuid - гуид дб-источника, который исключается из рассылки (если заполнен)
	_propDeltas(direction, deltas, srcGuid) {
		var that = this;
		//console.log("MemDb._propDeltas "+this._name,deltas);

		var allSubs = {}; // гуиды всех подписчиков
		if (direction == "all" || direction == "subs") {
			for (var i=0; i<deltas.length; i++) {
				var root = this.getRoot(deltas[i].guid);
				var rsubs = root.getSubsGuids();

				for (var j=0; j<rsubs.length; j++) { // todo refact инкапсулировать
					if (srcGuid != rsubs[j]) {
						if (!(rsubs[j] in allSubs)) allSubs[rsubs[j]]=[];
						allSubs[rsubs[j]].push(deltas[i]);
					}
				}
			}	
		}	

		if (direction == "all" || direction == "parent") {
			if (srcGuid!=this.getParentGuid()) {
				var dnew = [];
				for (i=0; i<deltas.length; i++) {
					var r = this.getRoot(deltas[i].guid);
					if (r && !r.isMaster()) 
						dnew.push(deltas[i]); // если рут не мастер, то надо запомнить его, чтобы применить выше
				}
				if (dnew.length>0)
					allSubs[this.getParentGuid()] = dnew;
			}

		}
		// отправить дельты	
		return this._newSendDeltas(allSubs); 

	}

	// зарегистрировать новый рут в базе
	_regRoot(root) {
		this._roots[root.getGuid()] = root;
	}
	
	printInfo() {
		console.log("Db: ",this._name,"  guid: ",this._dbGuid, " tran ",this._curTranGuid);
		for (var g in this._roots) {
			var s = "";
			for (var i=0; i<10; i++) {
				if (this._roots[g]._data[i]) 
					s+=i.toString()+": "+this._roots[g]._data[i]+"   "
			}
			console.log("Root:",g,"  ",s);
		}
		//console.log("Roots: ",this._roots);
	}


}