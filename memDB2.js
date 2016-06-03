'use strict';

function guid() {

    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    };

    return s4() + s4() +'-'+ s4()  +'-'+ s4() +'-'+
        s4() +'-'+ s4() + s4() + s4();
}



class MemDbController {
	constructor() {
		this._databases = {};
	}
	
	_regMemDb(db) {
		this._databases[db.getGuid()];
	}
	
	_subscribeRoots(subDb,parentRootGuids,done) {
		var parentDb = this._database[subDb.getParentGuid()];
		var newData = {};
		for (var i=0; i<parentRootGuids.length; i++) {
			var root = parentDb.getRoot(parentRootGuids[i]);
			root._subscribe(subDb.getGuid());
			for (var i in root._data) 
				newData[i] = root._data[i];
			new RootDb(subDb,newData,parentRootGuids[i],root.getVersion());
		}
	}
	
	
}



class MemDatabase {
	constructor(controller, parentDbGuid) {
		this._controller = controller;
		this._parentDbGuid = parentDbGuid;
		this._dbGuid = guid();
		this._version = 1;
		this._roots = [];
		controller._regMemDb(this);
	}
	
	// подписать на руты мастер базы. Руты приходят в виде дельты
	subscribeRoots(rootGuids, done) {
		this._controller._subscribeRoots(this,rootGuids,done);
	}
	
	_unsubscribeRoots(rootGuids, done) {
	}
	
	// мастер рут
	addMasterRoot(data) {
		var r = new RootDb(this,data);
		this._roots.push(r);		
		return r;
	}
	
	_addRoot() {
		var r = new RootDb(this);
		this._roots.push(r);
	}
	
	getGuid() {
		return this._dbGuid;
	}
	
	getParentGuid() {
		return this._parentDbGuid;
	}
	
	getRoot(id) {
	}
	
	rootCount() {
	}
	
	getVersion() {
	}
	
}

class RootDb {
	constructor(db, data, parentGuid, parentVersion) {
		this._db = db;
		this._subscribers = {};
		this._data = {};
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
	
	_subscribe(dbGuid) {
		//todo проверить что в списке подписчиков БД
		this._subscribers[dbGuid] = true;
	}
	
}

class DataObject {
	constructor(str) {
		this._str = str;
	}
	
	dataobject_get() {
		alert('Data : '+this._str);
	}
	static bu() {
		return "bu";
	}
	
}

class ClientData extends DataObject {
	constructor(str) {
		super(str);
		this._str2 = str;
	}
	
	get() {
		alert('DataClient : '+this._str2);
	}
	
	static clientbu() {
		return "clientbu";
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
chld1_1.subscribeRoots([r1.getGuid()]);

/*
var o = {};
var myobj = new ClientData("VENIK");
var p = Object.getPrototypeOf(myobj);

p.get();
o.x = 1;
*/
//alert(p.clientbu());

//myobj.get();