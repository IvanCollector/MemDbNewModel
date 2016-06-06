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
	
	_receiveDeltas(deltas) {
	}
	
	// сюда входит вызов на стороне парента
	_subscribeRootsParentSide(subDbGuid, parentDbGuid,rootGuids) {
		var parentDb = this._databases[parentDbGuid];
		var res =  parentDb._subscribeRootsParentSide(subDbGuid,rootGuids);
		parentDb._genSendDeltas(); // сгенерировать и послать дельты после подписки
		return res;
	}
	
	// подписка субДБ на руты, возвращает промис
	_subscribeRoots(subDb,rootGuids) {
		var that = this;
		console.log("MemController._subscribeRoots");
		return new Promise( function(accept, reject) {
			// эмулируем удаленный вызов чере асинхронный таймаут
			setTimeout( function() { 
				var res = that._subscribeRootsParentSide(subDb.getGuid(),subDb.getParentGuid(),rootGuids); 
				accept(res); }, 0);	
		});				
	}	
	
	// послать deltas, которые сгенерированны для db подписчикам
	_sendDeltas(dbGuid,deltas) {
		var that = this;
		console.log("MemController._sendDeltas");
		
		
		/*
		return new Promise( function(accept, reject) {
				// эмулируем удаленный вызов
				setTimeout( function() { 
					var db = that._databases[dbGuid];
					var res = db._applyDeltas(deltas);
					accept(res); }, 0);	
			});	
			*/
					var db = that._databases[dbGuid];
					var res = db._applyDeltas(deltas);
	}
}



class MemDatabase {
	constructor(controller, parentDbGuid) {
		this._controller = controller;
		this._parentDbGuid = parentDbGuid;
		this._dbGuid = guid();
		this._version = 1;
		this._roots = {};
		controller._regMemDb(this);
	}
	

	
	unsubscribeRoots(rootGuids, done) {
	}
	
	// мастер рут
	addMasterRoot(data) {
		var r = new RootDb(this,data);	
		return r;
	}
	
	
	getGuid() {
		return this._dbGuid;
	}
	
	getParentGuid() {
		return this._parentDbGuid;
	}
	
	getRoot(guid) {
		return this._roots[guid];
	}
	
	rootCount() {
	}
	
	getVersion() {
	}

	// подписать на руты мастер базы. Руты приходят в виде дельты
	// rootGuid - массив гуидов рутов
	// возвращает промис
	subscribeRoots(rootGuids) {	
		return this._controller._subscribeRoots(this,rootGuids);
	}
	
	_subscribeRootsParentSide(subDbGuid,rootGuids) {
		console.log("memDB._subscribeRootsParentSide",subDbGuid,rootGuids);
		var newData = {};
		var res = [];
		for (var i=0; i<rootGuids.length; i++) {
			var root = this.getRoot(rootGuids[i]);
			res.push(root);
			root._subscribe(subDbGuid);
		}
		return res;		
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
			}
		}
	}
	
	// сгенерировать и послать все дельты для данной бд
	_genSendDeltas() {
		var deltas = [];
		var allSubs = {}; // гуиды всех подписчиков
		for (var root in this._roots) {
			 var d = this._roots[root]._genDelta();
			 if (d) {
				deltas.push(d);
				for (var subs in this._roots[root]._subscribers) {
					if (!(subs in allSubs)) allSubs[subs]=[];
					allSubs[subs].push(d);
				}
			}
		}		
		// отправить дельты		
		for (subs in allSubs) 
			this._controller._sendDeltas(subs,allSubs[subs]);

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
		this._data[idx] = value;
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
	
	_genDelta() {
		var d = {};
		for (var i=0; i<this._log._log.length; i++) { // todo инкапсулировать лог
			if (this._log._log[i].type == "s") { // subscription
				d = this.serialize();
				d.add = 1;
				return d;
			}
		}
		return;
	}

	_subscribe(dbGuid) {
		//todo проверить что в списке подписчиков БД
		this._subscribers[dbGuid] = true;
		this._log.addSubscription(dbGuid);
	}

	
}

class RootLog {
	constructor(root) {
		this._root = root;
		this._log = [];
	}
	
	// добавить в лог подписку базы subDbGuid на рут этого лога
	addSubscription(subDbGuid) {
		var logElem = {};
		logElem.type = "s";
		logElem.subDbGuid = subDbGuid;
		this._log.push(logElem);
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
			/*
			setTimeout( function() {
				console.log("DATA");
				for (var i=0; i<6; i++) {
					var v = chld2_2.getRoot(r1_2.getGuid()).getData(i);
					if (v) console.log(" ",i,": ",v);
				}
				
			}, 0);
			*/
	});
