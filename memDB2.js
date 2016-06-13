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

	// сюда входит вызов на стороне парента для подписки бд
	// subDbGuid - гуид БД, которую подписываем
	// dbGuid - гуид родительской БД
	// rootGuids - массив гуидов рутов, на которые нужно подписаться
	_subscribeRootsParentSide(subDbGuid, dbGuid,rootGuids) {
		var db = this._databases[dbGuid];
		var resGuids =  db._subscribeRootsParentSide(subDbGuid,rootGuids);
		return new Promise( function(accept, reject) {
			var p = db._genSendDeltas(); // сгенерировать и послать дельты после подписки
			p.then( function(res) { 
						accept(resGuids); })
			});
	}
	
	// подписка subDb на руты rootGuids родительской базы
	// возвращает промис
	
	_subscribeRoots(subDb,rootGuids) {
		var that = this;
		console.log("MemController._subscribeRoots");
		return new Promise( function(accept, reject) {
			// эмулируем удаленный вызов чере асинхронный таймаут
			setTimeout( function() { 
				var p = that._subscribeRootsParentSide(subDb.getGuid(),subDb.getParentGuid(),rootGuids);
				p.then(function(res) { 
							accept(res); });
				}, 0);	
		});				
	}	
	
	// послать deltas, которые сгенерированны для db подписчикам
	_sendDeltas(data) {
		var that = this;
		console.log("MemController._sendDeltas");

		return new Promise( function(accept, reject) {
				// эмулируем удаленный вызов
				setTimeout( function() { 
					for (var dbGuid in data) {
						var db = that._databases[dbGuid];
						db._applyDeltas(data[dbGuid]);
					}
					accept("foo"); }, 0);	
			});	
	}
}



class MemDatabase {
	constructor(controller, parentDbGuid) {
		this._controller = controller;
		this._parentDbGuid = parentDbGuid;
		this._dbGuid = guid();
		this._version = 1;
		this._roots = {};
		// транзакции
		this._readOnlyMode = true;
		this._tranGuid = undefined;
		this._tranCount = 0;
		controller._regMemDb(this);
	}
	
	// добавить мастер рут с данными data
	addMasterRoot(data) {
		var r = new RootDb(this,data);	
		return r;
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
	
	// стартовать внешнюю транзакцию с гуидом guid
	// sourceGuid - гуид ДБ-источника транзакции
	_startExternal(guid, sourceGuid) {
		if (this.inTran() && guid != this.tranGuid)
			throw new Error("can't start external transaction")
		this._readOnlyMode = false;
		if (this.inTran()) 
			return;
		this._tranGuid = guid;
	}
	
	// стартовать транзакцию
	start() {
		if (this.inTran() && this.isReadOnly()) 
			throw new Error("can't start transaction: database is in readonly mode");

		if (this._tranCount == 0) {
			this._tranGuid = guid();
			this._readOnlyMode = false; // можно редактировать мемдб
			this._tranCount = 1;
		}
		else
			this._tranCount++;
	}
	
	commit() {
		return new Promise( function(accept, reject) {
			/*
			if (this._tranCount == 0) 
				throw new Error("can't commit: transaction not started");
				
			if (this.isReadOnly()) 
				throw new Error("can't commit: memDb is in readonly mode");		

			*/	
			if (this._tranCount == 1) {	
				this._tranGuid = undefined;
				//todo распространить транзакцию по паренту/подписчикам
				
			}

			this._tranCount--;
			
			accept();
		});
			
	}
	
	rollback() {
	}
	
	inTran() {
		if (this._tranCount == 0)
			return false;
		else
			return true;
	}
	
	isReadOnly() {
		return this._readOnlyMode;
	}
	
	get tranGuid() {
		return this._tranGuid;
	}
	
	// вызов с клиента - генерирует дельты и добавляет удаленные вызовы, которые буферизовались
	_remoteClient() {
	
		if (this.isReadOnly()) 
			throw new Error("can't exec a remote call: database is in readonly mode");
			
		var p = new Promise( function(accept, reject) {
			// создать пакет транзакции удаленного вызова и передать его паренту
		});
		return p;
	}
	
	_remoteParent() {
	
	}
	
	

	// подписать на руты родительской базы. Руты приходят в виде дельт
	// и применяются к базе до того, как отрабатывает обработчик промис
	// rootGuid - массив гуидов рутов
	// возвращает промис
	subscribeRoots(rootGuids) {	
		var that = this;
		return new Promise( function(accept, reject) {
			var p = that._controller._subscribeRoots(that,rootGuids);
			p.then(function(res) {  
				var resRoots = [];
				for (var i=0; i<res.length; i++) {
					resRoots.push(that.getRoot(res[i]));
				}
				accept(resRoots);
			});
		 });
	}
	
	// вызывается аналогичной функцией контроллера
	_subscribeRootsParentSide(subDbGuid,rootGuids) {
		console.log("memDB._subscribeRootsParentSide",subDbGuid,rootGuids);
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
		console.log("memDB._applyDeltas");
		for (var i=0; i<deltas.length; i++) {
			var d = deltas[i];
			if (d.add) { // дельта с новым рутом
				var r = new RootDb(this, d.data, d.guid, d.version);
			}
			if (d.mod) {
				// применить новые значения дельты
				var root = this._getRoot(d.guid);
				for (var idx in d.data) {
					this.setData(idx,d.data[idx]);
				}
			}
		}
	}
	
	// сгенерировать и послать все дельты для данной бд
	_genSendDeltas() {
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
		return this._controller._sendDeltas(allSubs); 

	}

	// зарегистрировать новый рут в базе
	_regRoot(root) {
		this._roots[root.getGuid()] = root;
	}	
}

class RootDb {
	constructor(db, data, parentGuid, parentVersion) {
		this._db = db;
		this._subscribers = {};
		this._data = {};
		this._log = new RootLog(this);
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

	// чтение / запись данных в вектор рута
	getData(idx) {
		return this._data[idx];
	}

	setData(idx, value) {
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
var master = new MemDatabase(controller);  	// создаем корневую базу
var chld1_1 = new MemDatabase(controller,master.getGuid());
var chld1_2 = new MemDatabase(controller,master.getGuid());
var chld2_1 = new MemDatabase(controller,chld1_1.getGuid());
var chld2_2 = new MemDatabase(controller,chld1_1.getGuid());

var r1 = master.addMasterRoot({1: 34, 2: 99 });


chld1_1.subscribeRoots([r1.getGuid()])
	.then( function(res) {
		return chld2_1.subscribeRoots([r1.getGuid()]); })
	.then( function(res) {
			console.log("DATA");
			for (var i=0; i<6; i++) {
				var v = chld2_1.getRoot(r1.getGuid()).getData(i);
				if (v) console.log(" ",i,": ",v);
			}
		});

		
var r1_2 = chld1_1.addMasterRoot({ 2: 1, 3: 3, 4: 5});

chld2_2.subscribeRoots([r1_2.getGuid()])
	.then( function(res) {
			console.log("PRINT DATA");
				console.log("DATA");
				for (var i=0; i<6; i++) {
					var v = chld2_2.getRoot(r1_2.getGuid()).getData(i);
					if (v) console.log(" ",i,": ",v);	
				}					

	});

r1_2.setData(0,777);
chld1_1._genSendDeltas();

