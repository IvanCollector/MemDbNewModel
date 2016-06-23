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
		
		//if (this.inTran()) 
		//	return;

		this._curTran = new MemTransaction(this);
		this._curTran._start(extGuid);
		
	}


	commit(){

		if (!this._curTran) {	
			throw new Error("нельзя завершить незапущенную транзакцию");	
		}
		else {
			this._curTran._commit();
			if (this._curTran.state() == "commited")
				this._curTran = undefined;
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
					if (that._calls.length==0 && !packet.commit)
						return that._remoteClient(true,true);		// отправить команду завершения транзакции
					else {
						that.commit(); // коммитить локально (приходим сюда когда отвечает коммит парента)
					}
					
				}).then(function(res) {
					console.log("END OF REMOTE CLIENT");
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

		if (!async) {
			this._readOnlyMode = true;
		}	

		return this._remoteClientPromise(packet);
	}
	
	_remoteParent(packet) {
		var that = this;
		this._startExternal(packet.tran, packet.db);
		// todo очередь сделать
		return that._exec(packet).then( function(res, tran){
			var r = {};
			r.results = [];
			r.results.push(res);

			if (packet.commit)
				that.commit();

			return r;
		});
	}


	// отправить на мастер дельты, дождаться ответа, выполнить вызовы, сформировать новые дельты и разослать их
	_exec(packet) {
		var that = this;
		var funcresult = null;
		return new DbPromise(this, function(resolve,reject,tran) {
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
			else {
				that._applyDeltas(packet.deltas); // применить дельты на данной БД
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

			}

		});
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

		return this._sendDeltas(allSubs); 
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
		return this._sendDeltas(allSubs); 

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

class MemTransaction {
	constructor(memDb){
		this._tranCount = 0;
		this._tranGuid = undefined;
		this._state = "notStarted";
		this._memDb = memDb;
	}	

	getGuid() {
		return this._tranGuid;
	}

	state() {
		return this._state;
	}

	getDb() {
		return this._memDb;
	}

	_start(extGuid) {
		if (this._state == "commited") {
			throw new Error("нельзя запустить завершенную транзакцию");
		}
		var ng = guid();
		if (this._tranCount==0) {
			this._tranGuid = (extGuid ? extGuid : ng);
			this._state = "started";
			if (guid) this._external = true;
		}

		this._tranCount++;
		//console.log("COUNT "+this._tranCount);
	}

	_commit() {
		if (this._state == "commited") {
			throw new Error("нельзя завершить уже завершенную транзакцию");
		}

		this._tranCount--;

		if (this._tranCount==0) {
			this._state = "commited";
			this._tranGuid = undefined;
		} 
	}

}



class RootDb {
	constructor(db, data, parentGuid, parentVersion, params) {
		this._db = db;
		this._subscribers = {};
		this._data = {};
		this._log = new RootLog(this);
		if (params) this._name = params.name;
		if (data) 
			for (var elem in data) this._data[elem] = data[elem];	
		
		if (parentGuid)  {
			this._parentVersion = parentVersion;
			this._isMaster = false;
			this._guid = parentGuid;
		}
		else {
			this._isMaster = true;
			this._guid = guid();
		}

		db._regRoot(this);
	}
	
	isMaster() {
		return this._isMaster;
	}
	
	getGuid() {
		return this._guid;
	}
	
	getVersion() {
		if (this.isMaster())
			return this._db.getVersion();
		else
			return this._parentVersion;
	}
	
	getDb() {
		return this._db;
	}

	// чтение / запись данных в вектор рута
	getData(idx) {
		return this._data[idx];
	}

	setData(idx, value, tranGuid) {
		var db = this.getDb();
		if (db.isReadOnly()) 
			throw new Error("can't exec setData: db is in readonly mode");

		if (!db.inTran()) 
			throw new Error("can't exec setData: not in scope of transaction");

		var tg = db._curTran.getGuid();
		if (tg && (tg === tranGuid)) {
			var ov = this._data[idx];
			this._data[idx] = value;	
			this._log._addModifValue(idx,ov,value);
		}
		else 
			throw new Error("can't modify data " + (tg ? "in scope of a wrong transaction " : "without transaction"));
	}

	_print() {
		console.log("PRINT ROOT DATA "+this._name);
		for (var i=0; i<6; i++) {
			var v = this.getData(i);
			if (v) console.log(" ",i,": ",v);	
		}	
	}
	
	// сериализация рута в json
	serialize() {
		var sroot = {};
		sroot.dbGuid = this._db.getGuid();
		sroot.guid = this.getGuid();
		sroot.version = this.getVersion();
		sroot.data = {};
		sroot.name = this._name;
		for (var i=0; i<6; i++)
			if (this.getData(i)) sroot.data[i] = this.getData(i);
		return sroot; //JSON.stringify(sroot);
	}
	
	_getLog() {
		return this._log;
	}
	
	_genDelta() {
		var d = undefined;
		for (var i=0; i<this._log._logCount(); i++) {
			var logItem = this._log._getLogItem(i);
			if (logItem.type == "m") { // modification
				if (!d) {
					d = {};
					d.dbGuid = this._db.getGuid();
					d.guid = this.getGuid();
					d.version = this.getVersion();
					d.data = {};
					d.mod = 1;
				}
				d.data[logItem.index] = logItem.nv;
			}
		}
		this._log._clear();
		return d;
	}

	_subscribe(dbGuid) {
		//todo проверить что в списке подписчиков БД
		this._subscribers[dbGuid] = true;
		this._log._addSubscription(dbGuid);
	}

	getSubsGuids() {
		return Object.keys(this._subscribers);
	}

	
}

class RootLog {
	constructor(root) {
		this._root = root;
		this._log = [];
		this._newSubsGuids = []; 	// массив новых подписчиков
	}
	
	_logCount() {
		return this._log.length;
	}
	
	_getLogItem(i) {
		return this._log[i];
	}
	
	_getNewSubscribersGuids() {
		return this._newSubsGuids.slice(0,this._newSubsGuids.length);
	}
	
	// добавить в лог подписку базы subDbGuid на рут этого лога
	_addSubscription(subDbGuid) {
		this._newSubsGuids.push(subDbGuid);
	}
	
	_addModifValue(idx, ov, nv) {
		if (ov==nv) return;
		var logElem = {};
		logElem.type = "m";
		logElem.index = idx;
		logElem.ov = ov;
		logElem.nv = nv;
		this._log.push(logElem);		
	}
	
	_clear() {
		this._log = [];
		this._newsubs = [];
	}
	
}




class DbPromise {
	constructor(memDb, func, dbgTech) {

		if (memDb instanceof MemDataBase) {
			this._memDb = memDb;
			// стартовать транзакцию (предполоагаем, что НОВУЮ!)
			this._memTran = this._memDb.start();
		}

		this._num = this._memTran.getDb()._incPromise(this);
		this._state = "waiting";
		this._tech = dbgTech;

		var that = this;

		var _defResolve = function(res){
				console.log("RESOLVED ", res, "Promise ", that._num, "tech:", that._tech);	
				setTimeout(function() {
					if (that._resolve) 	
						that._resolve(res,that._memTran); 
					that._memDb.commit();
					that._state = "resolved";
				},0);
		}
		this._defResolve = _defResolve;

		var _defReject = function(res){
			console.log("REJECTED ", res);
				setTimeout(function() {
					if (that._reject)
						that._reject(res,that._memTran); 
					that._memDb.commit(); // todo заменить на ролбэк?
					that._state = "rejected";
				},0); 
		}
		this._defReject = _defReject;

		return func(this._defResolve,this._defReject, this._memTran);
	}


	getResolve() {
		return this._defResolve;
	}

	then(resolve, reject) {
		
		var that = this;

		// создать технический промис и вернуть его наружу (чтобы можно было сделать цепочку .then)
		var techPromise = new DbPromise(this._memDb,function(_resolve,_reject,tr) {
				console.log("TECH PROMISE CREATED");
				return;
			},true);
		
		if (resolve) {
			var wrp = function(res,tran) { // обработчик resolve ЭТОГО промиса
				var r = resolve(res,tran);
				var fres = techPromise.getResolve();

				if (r instanceof DbPromise) {
					r._resolve = function(res, tran) {
						fres(res, tran);
					}
					//r.getResolve(res,tran);
				}
				else { // синхронный обработчик
					techPromise._defResolve(r, tran);
				}
				return "WRAPPER";
			}

			this._resolve = wrp;

		}
		//todo аналогично для reject

		return techPromise;
	}

	getNum(){
		return this._num;
	}
}


function test2() {

	var controller = new MemDbController();		// создаем контроллер базы
	var master = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу
	var chld1 = new MemDataBase(controller,master.getGuid(),{name: "Level1_Db1"});

	var r1,r2;

	var userFunc1 = function(resolve,reject, tran) {
			//var p1 = new DbPromise
			console.log("INIT MASTER BASE");
			r1 = master.addMasterRoot({1: 34, 2: 99 }, { name: "MasterBase_Root1"} );
			r1._print();
			r1.setData(1,345,tran.getGuid());
			setTimeout(function() {
				console.log("RESOLVE MASTER BASE");
				resolve("OK");
			} ,50);
		};



	var f2 = function(resolve, reject) {
			var p = master.run(userFunc1);
			p.then( function(res) {
				var p2 = chld1.run(function(resolve,reject,tran) {
					r2 = chld1.addMasterRoot({ 2: 1, 3: 3, 4: 5} , {name: "Level1_Db1_Root1"} ); 
					resolve("JOPAS");
				});
				p2.then( function() { resolve("TT"); });
			});
		};

	var sp1 = new Promise(f2)
		.then(function(res) {
			r2._print();
		});

}

function test1() {

new DbPromise( db, function(resolve, reject, tran) {
	setTimeout(function() {
		console.log("EXECUTOR ONE");
		resolve(1);
	}, 1000);
})
.then(function(res, tran) {
	console.log("MY 1st EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})
.then(function(res, tran) {
	console.log("MY 2nd EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})
.then(function(res, tran) {
	return new DbPromise(db, function(resolve, reject, tran) {  // здесь возвращаем ПРОМИС
		console.log("EXECUTOR TWO");
		resolve(100);
	})
})
.then(function(res, tran) {
	console.log("MY 3rd EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})
.then(function(res, tran) {
	console.log("MY 4th EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})
;

}

function test3() {

new DbPromise( db, function(resolve, reject, tran) {
	//setTimeout(function() {
		console.log("EXECUTOR ONE");
		resolve(1);
	//}, 1000);
})
.then(function(res, tran) {
	console.log("MY 1st EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})
.then(function(res, tran) {
	console.log("MY 2nd EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})

.then(function(res, tran) {
	return new DbPromise(db, function(resolve, reject, tran) {  // здесь возвращаем ПРОМИС
		console.log("EXECUTOR TWO");
		resolve(100);
	})
})
.then(function(res, tran) {
	console.log("MY 3rd EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})
.then(function(res, tran) {
	console.log("MY 4th EVENT HANLDER ", res);
	console.log("TRAN  ", tran.getGuid()+" "+tran.state());
	return res+1;
})
;

}


var controller = new MemDbController();		// создаем контроллер базы
var db = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу

test3();

setTimeout( function() {
	console.log(db);
},500);

	/*
.then(function(res, tr) {
		return new DbPromise(db,function(resolve,reject, tr) {
		console.log("THIRD PROMISE EXECUTOR");
		setTimeout(function() {
			console.log("THIRD TIMEOUT");
			resolve("OK3");
		} 
			,0);
	} );
	})
;
*/


/*

var p = new MyPromise(db, function(resolve,reject, tr) {
		setTimeout(function() {
			resolve("OK");
		} 
			,50);
	});

var p2 = p.then(function(res, tr) {
	console.log("MY EVENT HANLDER ", res);
	console.log("TRAN ", tr.tranGuid()+" "+tr.state());
	return 1;

	}).then(function(res, tr) {
		return new MyPromise(db,function(resolve,reject, tr) {
		setTimeout(function() {
			resolve("OK2");
		} 
			,50);
	} );
	});

p2.then(function(res, tr) {
	console.log("MY 2ND EVENT HANLDER ", res);
	console.log("TRAN 2 ", tr.tranGuid()+" "+tr.state());
	return 2;

	});

*/

