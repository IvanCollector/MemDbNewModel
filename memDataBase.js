'use strict';


function guid() {

    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    };

    return s4() + s4() +'-'+ s4()  +'-'+ s4() +'-'+
        s4() +'-'+ s4() + s4() + s4();
}

// todo контроллеры также надо упорядочить в дерево
class MemDbController {
	constructor() {
		this._databases = {};
	}
	
	_regMemDb(db) {
		this._databases[db.getGuid()] = db;
	}
	
	getDb(guid) {
		return this._databases[guid];
	}
	
}


class MemDataBase {

	constructor(controller, parentDbGuid, params) {

		this._controller = controller;
		this._parentDbGuid = parentDbGuid;
		this._dbGuid = guid();
		this._version = 1;
		this._roots = {};
		// транзакции
		this._curTran = undefined;
		this._readOnlyMode = false;
		this._calls = [];

		this._promiseCount = 0;
		this.promises = {};

		controller._regMemDb(this);

		if (params)
			this._name = params.name;
	}

	
	// добавить мастер рут с данными data
	addMasterRoot(data, params) {

		if (!this._curTran) throw new Error("нельзя выполнить addMasterRoot: транзакция не открыта");
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
	
	// Методы управления транзакцией

	start() {

		if (!this._curTran) {
			this._curTran = new MemTransaction(this);
			this._curTran._start();
		}
		else 
			this._curTran._start();

		return this._curTran;
	}


	// стартовать внешнюю транзакцию с гуидом guid
	// sourceGuid - гуид ДБ-источника транзакции
	_startExternal(extGuid, sourceGuid) {
		if (this.inTran() && extGuid != this.tranGuid)
			throw new Error("can't start external transaction")
		this._readOnlyMode = false;
		
		if (!this._curTran) {
			this._curTran = new MemTransaction(this);
			this._curTran._start(extGuid);
		}		
	}


	commit(){
		if (!this._curTran) {	
			throw new Error("нельзя завершить незапущенную транзакцию Database: "+this._name);	
		}
		else {
			if (this._curTran.getTranCount()==1 && this.getParentGuid())
				this._remoteClient(true,true); // отправляем коммит паренту todo переделать...
			this._curTran._commit();
			if (this._curTran.state() == "commited") {
				this._curTran = undefined;
			}
		}
	}

	curTran(){
		return this._curTran;
	}

	inTran() {
		return (this._curTran!=undefined);
	}

	get tranGuid() {
		return this._curTran ? this._curTran.getGuid(): undefined;
	}


	run(userFunc) {
		
		var wrapFn = function(resolve,reject,tran) {
			setTimeout(function() {
				userFunc(resolve,reject,tran);
			},0);
		}
		
		var p = new DbPromise(this, wrapFn);
		
		if (!this.getParentGuid())
			return p;

		var that = this;

		//return p;
		

		return p.then( function(res,tran) {
			return that._remoteClient(true,false);
		});
		

	}

	_remoteClientPromise(packet) {
		var that = this;
		this._readOnlyMode = true; // в режим ридонли пока от парента не вернется ответ
		return new DbPromise(this, function(resolve,reject, tran) {
			
			setTimeout( function() {
				var parent = that.getController().getDb(that.getParentGuid());
				var p = parent._remoteParent(packet);
				p.then( function(res, tran) {
					that._readOnlyMode = false; // выйти из ридонли пока обработка колбэков
					if (packet.calls.length>0) // todo переделать на N элементов
						packet.calls[0].resolve(res.results[0]); // todo рекурсия асинхронная
				
				/*
					if (that._calls.length==0 && !packet.commit) {
						return that._remoteClient(true,true);		// отправить команду завершения транзакции
					}
					*/
					
				}).then(function(res, tran) {
					console.log("END OF REMOTE CLIENT "+packet.commit,"   ",packet);
					resolve(res);
				});
				
			},0);			
		});
	}
	
	// вызов с клиента - генерирует дельты и добавляет удаленные вызовы, которые буферизовались
	// async - (true) асинхронный 
	// commit - коммитить после применения
	_remoteClient(async, commit) {

		if (!this.inTran()) 
			throw new Error("can't exec a remote call: database is not in transaction");	
		if (this.isReadOnly()) 
			throw new Error("can't exec a remote call: database is in readonly mode");
			
		var that = this;
		// создать пакет транзакции удаленного вызова и передать его паренту
		var packet = { 
			db : this.getGuid(),
			tran : this.tranGuid,	
			async : async ? 1 : 0,			// вызов асинхронный или синхронный
			commit : commit ? 1 : 0,		// коммитить транзакцию или нет
			deltas : [],					// массив дельт
			calls : []						// массив удаленных вызовов
		};

		for (var rg in this._roots) {		// сгенерировать дельты
			var root = this._roots[rg];
			var d = root._genDelta();
			if (d) packet.deltas.push(d);
		}	
		if (this._calls.length>0) {
			packet.calls = this._calls.slice(0,this._calls.length);
		}
		// todo ВРЕМЕННО
		 this._calls = [];		

		return this._remoteClientPromise(packet);
	}
	
	_remoteParent(packet) {
		var that = this;
		this._startExternal(packet.tran, packet.db);
		// todo очередь сделать
		return this._exec(packet).then( function(res, tran){
			var r = {};
			r.results = [];
			r.results.push(res);

			if (packet.commit)
				that.commit();

			return r;
		});
		//return p; 
	}


	// отправить на мастер дельты, дождаться ответа, выполнить вызовы, сформировать новые дельты и разослать их
	_exec(packet) {
		var that = this;
		var funcresult = null;
		var p = new DbPromise(this, function(resolve,reject,tran) {
			var dnew = [];
			for (var i=0; i<packet.deltas.length; i++) {
				var d = that.getRoot(packet.deltas[i].guid);
				if (d && !d.isMaster()) {
					dnew.push(packet.deltas[i]); // если рут не мастер, то надо запомнить его, чтобы применить выше
				}
			}
			if (dnew.length>0) {
				var p = that._propDeltas("parent", dnew); 	// отправить дельты паренту
				p.then( function(res) {
					// todo
					// применить дельты на данной БД
					that._applyDeltas(packet.deltas);
					// разослать дельты подписчикам
					return that._propDeltas("subs", packet.deltas,packet.db);
					
				}).then( function(res) {
					// todo
					// выполнение методов (возможно удаленных)
					// генерация и рассылка дельт в парент и подписчикам 
					//resolve(res);
				});
			}
			else { // не отправляем выше
				that._applyDeltas(packet.deltas); // применить дельты на данной БД
				that._propDeltas("subs", packet.deltas,packet.db);	// разослать дельты подписчикам
				if (packet.calls.length>0) {
					// todo
					// выполнение методов (возможно удаленных)
					var rc = packet.calls[0];

					funcresult = that[rc.name](rc.arg); // должен быть асинхронным ?
					//return funcresult;
				}
				that._genSendDeltas();	// сгенерировать и разослать дельты после выполнения методов
				setTimeout( function() { // чтобы пришло после дельт
					resolve([funcresult]);
				}, 100);


				/*
				that._propDeltas("subs", packet.deltas,packet.db).then( function(res) { // разослать дельты подписчикам
					if (packet.calls.length>0) {
						// todo
						// выполнение методов (возможно удаленных)
						var rc = packet.calls[0];

						funcresult = that[rc.name](rc.arg); // должен быть асинхронным ?
						return funcresult;

					}
				}).then(function(res){
					// генерация и рассылка дельт в парент и подписчикам 
					return that._genSendDeltas();
					//return res;
					//return that._propDeltas("subs", packet.deltas,packet.db); // todo еще и в парент

				}).then(function(res, tran){
					resolve(funcresult);
				});
				*/

			}

		});
		return p;
	}



	_memRemote(obj) {
		if (!this.inTran())		// стартовать транзакцию при буферизации удаленного вызова
			this.start();
		this._calls.push(obj);
	}
	

	// подписать на руты родительской базы. Руты приходят в виде дельт
	// и применяются к базе до того, как отрабатывает обработчик промис
	// rootGuids - массив гуидов рутов
	// возвращает промис с массивом ссылок на руты (объекты)

	subscribeRoots(rootGuids) {

		if (!this.inTran()) 
			throw new Error("can't exec subscribeRoots: database isn't in transaction");	
		if (this.isReadOnly()) 
			throw new Error("can't exec subscribeRoots: database is in readonly mode");

		var that = this;
		return new DbPromise(this, function(resolve, reject, tran) {
				var a = { subDbGuid: that.getGuid(), rootGuids: rootGuids }
				var o = { name: "_subscribeRootsParentSide", arg: a, resolve: function(res) {
					var resRoots = [];
					for (var i=0; i<res.length; i++) {
						resRoots.push(that.getRoot(res[i]));
					}
					resolve(resRoots);					
				}}
				that._memRemote(o);
		});
	}


	_subscribeRootsParentSide(objsub) {
		if (!this.inTran()) throw new Error("can't subscribe on parent: database is not in transaction");	
		if (this.isReadOnly()) throw new Error("can't subscribe on parent: database is in readonly mode");

		var subDbGuid = objsub.subDbGuid, rootGuids = objsub.rootGuids;
		var res = [];
		for (var i=0; i<rootGuids.length; i++) {
			var root = this.getRoot(rootGuids[i]);
			res.push(root);
			root._subscribe(subDbGuid);
		}
		return rootGuids;		
	}
	
	// применить дельты к бд,
	// deltas - массив дельт, одна дельта = один рут
	_applyDeltas(deltas) {
		console.log("memDB._applyDeltas "+this._name, deltas);
		for (var i=0; i<deltas.length; i++) {
			var d = deltas[i];
			if (d.add) { // дельта с новым рутом
				var r = new RootDb(this, d.data, d.guid, d.version, {name: d.name+"__in__"+this._name});
			}
			if (d.mod) {
				// применить новые значения дельты
				var root = this.getRoot(d.guid);
				for (var idx in d.data) {
					root.setData(idx,d.data[idx]);
				}
			}
		}
	}


	// послать deltas, которые сгенерированны для db подписчикам
	_sendDeltas(data) {
		var that = this;
		
		return new DbPromise(this, function(resolve, reject, tran) {
				// эмулируем удаленный вызов
				setTimeout( function() { 
					for (var dbGuid in data) {
						var db = that.getController()._databases[dbGuid];
						db._applyDeltas(data[dbGuid]);
					}
					resolve("foo"); }, 0);	
			});	
	}

	// послать deltas, которые сгенерированны для db подписчикам
	_newSendDeltas(data) {
		var that = this;
		
		setTimeout( function() { 
			for (var dbGuid in data) {
				var db = that.getController()._databases[dbGuid];
				db._applyDeltas(data[dbGuid]);
			}
		}, 0);	

	}
	
	// сгенерировать и послать все дельты для данной бд
	_genSendDeltas() {
		console.log("MemDb._genSendDeltas "+this._name);

		var allSubs = {}; // гуиды всех подписчиков
		for (var rg in this._roots) {
			var root = this._roots[rg];
			var d = root._genDelta();
			var newSubs = root._getLog()._getNewSubscribersGuids();
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
	}

	// разослать deltas, которые сгенерированны для db подписчикам
	// direction - "subs" - послать подписчикам "parent" - послать родительской бд, "all" - послать всем
	// deltas - массив дельт
	// srcGuid - гуид дб-источника, который исключается из рассылки (если заполнен)
	_propDeltas(direction, deltas, srcGuid) {
		var that = this;
		console.log("MemDb._propDeltas "+this._name,deltas);

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

	_incPromise(curPromise) {
		var cnum =  ++this._promiseCount;
		this.promises[cnum] = curPromise;
		return cnum;
	}

	// зарегистрировать новый рут в базе
	_regRoot(root) {
		this._roots[root.getGuid()] = root;
	}


}