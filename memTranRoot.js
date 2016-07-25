'use strict';

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
	
	getTranCount() {
		return this._tranCount;
	}
	
	isExternal() {
		return (this._external ? true : false);
	}

	_start(extGuid) {
		if (this._state == "commited") {
			throw new Error("нельзя запустить завершенную транзакцию");
		}
		if (this._tranCount==0) {
			this._tranGuid = (extGuid ? extGuid : guid());
			this._state = "started";
			if (extGuid) this._external = true;
		}

		this._tranCount++;
		//console.log("COUNT "+this._tranCount);
	}

	_commit() {
		if (this._state == "commited") {
			throw new Error("нельзя завершить уже завершенную транзакцию, Database: "+this._memDb._name);
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

	// todo сделать отдельный метод, который пишет даже если ридонли и выкинуть applyMode
	setData(idx, value, tranGuid, applyMode) {
		var db = this.getDb();
		if (db.isReadOnly() && !applyMode) 
			throw new Error("can't exec setData: db "+db._name+" is in readonly mode");

		if (!db.inTran()) 
			throw new Error("can't exec setData: db "+db._name+" not in scope of transaction");

		var tg = db._curTran.getGuid();
		if (tg && (tg === tranGuid)) {
			var ov = this._data[idx];
			this._data[idx] = value;
			if (!applyMode)
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
		if (this._root.getDb().isLogActive()) {
		this._newSubsGuids.push(subDbGuid);
		}
	}
	
	_addModifValue(idx, ov, nv) {
		if (this._root.getDb().isLogActive()) {
			if (ov==nv) return;
			var logElem = {};
			logElem.type = "m";
			logElem.index = idx;
			logElem.ov = ov;
			logElem.nv = nv;
			this._log.push(logElem);	
		}		
	}
	
	_clear() {
		this._log = [];
		this._newsubs = [];
	}
	
}

