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
	
	// послать deltas, которые сгенерированны для db подписчикам
	_sendDeltas(data) {
		var that = this;
		

		return new Promise( function(resolve, reject) {
				// эмулируем удаленный вызов
				setTimeout( function() { 
					for (var dbGuid in data) {
						var db = that._databases[dbGuid];
						db._applyDeltas(data[dbGuid]);
					}
					resolve("foo"); }, 0);	
			});	
	}
}



class MemDatabase {
	constructor(controller, parentDbGuid, params) {

		this._controller = controller;
		this._parentDbGuid = parentDbGuid;
		this._dbGuid = guid();
		this._version = 1;
		this._roots = {};
		// транзакции
		this._curTran = undefined;
		this._readOnlyMode = true;
		this._tranGuid = undefined;
		this._calls = [];
		controller._regMemDb(this);

		if (params)
			this._name = params.name;
	}
	
	// добавить мастер рут с данными data
	addMasterRoot(data, params) {
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

	
	// стартовать транзакцию
	/*
	start() {
		if (this.inTran() && this.isReadOnly()) 
			throw new Error("can't start transaction: database is in readonly mode");

		this._tranGuid = guid();
		this._readOnlyMode = false; // можно редактировать мемдб
	}
	*/

	
	/*
	_commit() {
		if (!this.inTran()) 
			throw new Error("can't commit : database is not in transaction");		
		if (this.isReadOnly()) 
			throw new Error("can't commit transaction: database is in readonly mode");

		this._tranGuid = undefined;
		this._readOnlyMode = false;			
	
	}
	*/

/*
	startAsync() {
		var that = this;

		return new Promise(function(resolve,reject){ // todo реорганизовать в очередь транзакций

			if (that.inTran() && that.isReadOnly()) 
				throw new Error("can't start transaction: database is in readonly mode");

			that._tranGuid = guid();
			that._readOnlyMode = false; // можно редактировать мемдб	
			resolve(that._tranGuid);
		});
	}
*/

	inTran() {
		return (this._curTran!=undefined);
	}
	
	isReadOnly() {
		return this._readOnlyMode;
	}
	
	get tranGuid() {
		return this._curTran ? this._curTran.getGuid(): undefined;
	}


	// стартовать внешнюю транзакцию с гуидом guid
	// sourceGuid - гуид ДБ-источника транзакции
	_startExternal(guid, sourceGuid) {
		if (this.inTran() && guid != this.tranGuid)
			throw new Error("can't start external transaction")
		this._readOnlyMode = false;
		if (this.inTran()) 
			return;
		//this._tranGuid = guid;
		this._curTran = new MemTransaction(this);
		this._curTran._start(guid);
		
	}

// NEW TRAN BEGIN

	start() {
		if (this.isReadOnly())  throw new Error("can't start transaction: database is in readonly mode");
		if (!this._curTran) {
			this._curTran = new MemTransaction(this);
			this._curTran._start();
		}
		else 
			this._curTran._start();

		return this._curTran;
	}

	commit() {
		if (!this._curTran) throw new Error("нельзя завершить незапущенную транзакцию");	
		if (this.isReadOnly())  throw new Error("can't commit transaction: database is in readonly mode");

		this._curTran._commit();
		if (this._curTran.getTranCount() == 0) {
			this._curTran = undefined;
		}
		//this._readOnlyMode = false;	
	}

	curTran(){
		return this._curTran;
	}

	// NEW TRAN END

	_remoteClientPromise(packet) {
		var that = this;
		this._readOnlyMode = true; // в режим ридонли пока от парента не вернется ответ
		return new Promise( function(resolve,reject) {
			
			setTimeout( function() {
				var parent = that.getController().getDb(that.getParentGuid());
				var p = parent._remoteParent(packet);
				p.then( function(res) {
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
		return that._exec(packet).then( function(res){
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
		return new Promise(function(resolve,reject) {
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

				}).then(function(res){
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

		var that = this;
		return new Promise(function(resolve, reject) {
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
		return this.getController()._sendDeltas(allSubs); 
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
		return this.getController()._sendDeltas(allSubs); 

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

	tranGuid() {
		return this._tranGuid;
	}

	state() {
		return this._state;
	}

	getDb() {
		return this._memDb;
	}

	getTranCount() {
		reutrn this._tranCount;
	}

	_start(extGuid) {
		if (this._state == "commited") {
			throw new Error("нельзя запустить завершенную транзакцию");
		}
		if (this._tranCount==0) {
			if (extGuid) {
				this._tranGuid = extGuid;
				this._external = true;
			}
			else	
				this._tranGuid = guid();
			this._state = "started";
		}

		this._tranCount++;
		console.log("COUNT "+this._tranCount);
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

	setData(idx, value) {
		var db = this.getDb();
		if (db.isReadOnly())
			throw new Error("can't exec setData: db is in readonly mode");

		if (!db.inTran()) db.start();	// если не в транзакции, то автоматически зайти в нее

		var ov = this._data[idx];
		this._data[idx] = value;	
		this._log._addModifValue(idx,ov,value);
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

/*
- создать контроллер
- создать мастер-базу
- создать мастер-руты в базе
- создать подписанную базу
- создать подписанные руты в базе

*/



var controller = new MemDbController();		// создаем контроллер базы
var master = new MemDatabase(controller,undefined,{name: "MasterBase"});  	// создаем корневую базу
var chld1_1 = new MemDatabase(controller,master.getGuid(),{name: "Level1_Db1"});
var chld1_2 = new MemDatabase(controller,master.getGuid(),{name: "Level1_Db2"});
var chld2_1 = new MemDatabase(controller,chld1_1.getGuid(),{name: "Level2_Db1"});
var chld2_2 = new MemDatabase(controller,chld1_1.getGuid(),{name: "Level2_Db2"});

var r1 = master.addMasterRoot({1: 34, 2: 99 }, {name: "MasterBase_Root1"} );

chld1_1.startAsync().then(function(res) { 
		chld1_1.subscribeRoots([r1.getGuid()]);
		return chld1_1._remoteClient(true,false);
	 })
	.then( function(res) {
		return chld2_1.startAsync();
	})
	.then( function(res) {
		chld2_1.subscribeRoots([r1.getGuid()]); 
		return chld2_1._remoteClient(true,false);
	})
	.then( function(res) {
			console.log("***DATA***");
			for (var i=0; i<6; i++) {
				var v = chld2_1.getRoot(r1.getGuid()).getData(i);
				if (v) console.log(" ",i,": ",v);
			}
		});



/*



var p = new MyPromise( function(resolve,reject) {
		setTimeout(function() {
			resolve("OK");
		} 
			,50);
	}).then( function(res) {
		console.log(res);
	});
*/


/*
var r1_2 = chld1_1.addMasterRoot({ 2: 1, 3: 3, 4: 5} , {name: "Level1_Db1_Root1"} );


chld2_2.subscribeRoots([r1_2.getGuid()]).then(function(res) {
	console.log("gogo DATA");

	var r2_2 =  chld2_2.getRoot(r1_2.getGuid());
	for (var i=0; i<6; i++) {
		var v = r2_2.getData(i);
		if (v) console.log("XXXX ",i,": ",v);	
	}		

 });

console.log("before");
console.log(chld2_2);

chld2_2._remoteClient(true,false).then( function(res){
	console.log("PRINT DATA");
	var r2_2 =  chld2_2.getRoot(r1_2.getGuid());
	for (var i=0; i<6; i++) {
		var v = r2_2.getData(i);
		if (v) console.log(" ",i,": ",v);	
	}	
	console.log(chld2_2);
});
*/

/*
chld2_2.subscribeRoots([r1_2.getGuid()])
	.then( function(res) {
			var r2_2 =  chld2_2.getRoot(r1_2.getGuid());
			chld2_2.start();
			r2_2.setData(2,777);
			chld2_2._remoteClient(true,true).then( function(res) {
				console.log("PRINT DATA 2");
				for (var i=0; i<6; i++) {
					var v = r1_2.getData(i);
					if (v) console.log(" ",i,": ",v);	
				}	
			});
	
			console.log("PRINT DATA");
			for (var i=0; i<6; i++) {
				var v = r2_2.getData(i);
				if (v) console.log(" ",i,": ",v);	
			}		
				

	});

*/


/*
r1_2.setData(0,777);
chld1_1._genSendDeltas();
*/
