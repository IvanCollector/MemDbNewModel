'use strict';

var _dbgTranLog = true; // трассировка в консоль старта/коммита транзакций

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
		this._cGuid = guid();
		this._controllers = {};
		this._databases = {};
		this._rcqueue = [];
	}


	
	getGuid() {
		return this._cGuid;
	}
	
	getDbGuids() {
		return Object.keys(this._databases);
	}
	
	getDb(guid) {
		return this._databases[guid].db;
	}	
	
	_tstQ() {
		var that = this;
		if (this._rcqueue.length>0) {
			var qitem = this._rcqueue[0];
			this._rcqueue.splice(0,1);
			if (qitem.resolve)
				qitem.fn().then(function(res) {
					qitem.resolve(res);
				});
			else
				qitem.fn();
		}
		if (this._rcqueue.length>0)
			setTimeout(function() {  that._tstQ(); },0);
		else this._flagStart = false;
	}
	
	_crc(fn) {
		var that = this;
		
		if (!this._flagStart) {
			setTimeout(function() {  that._tstQ(); },0);
			this._flagStart = true;
		}
	
		this._rcqueue.push({ fn:fn });			
	}
	
	_prc(fn) {
		var that = this;

		if (!this._flagStart) {
			setTimeout(function() {  that._tstQ(); },0);
			this._flagStart = true;
		}
				
		return new Promise(function(resolve,reject) {
			var qitem = { fn:fn, resolve:resolve, reject:reject };
			that._rcqueue.push(qitem);			
		});
	}

	
	// зарегистрировать базу данных с контроллером
	_addRemoteDb(cGuid, dbGuid) {
		if (!this._controllers[cGuid])
			throw new Error("can't register remote database, controller not found : "+cguid)
		if (!this._databases[dbGuid])
			this._databases[dbGuid] = { type: "remote", controllerInfo: this._controllers[cGuid] }	
	}
	
	_regMemDb(db) {
		this._databases[db.getGuid()] = { type: "local", db: db };	
		if (db.getParentGuid()) {
			var ci =this._databases[db.getParentGuid()].controllerInfo;
			ci.connector._regRemote(ci.guid, this.getGuid(), db.getGuid());
		}
	}

	connect(cInfo,back) {
		var that = this;
		return new Promise(function(resolve,reject) {
			that._controllers[cInfo.guid] = cInfo; //{ guid: cInfo.guid, type: cInfo.type, controller:cInfo.controller };
			if (cInfo.dbGuids) {
				for (var i=0; i<cInfo.dbGuids.length; i++) {
					that._databases[cInfo.dbGuids[i]] = { type: "remote", controllerInfo: that._controllers[cInfo.guid] }
				}
			}
			resolve();
		}).then(function() {
			if (!back)
				return cInfo.connector.connect(that,cInfo.guid ); //{ guid: that.getGuid(), type: "local", controller: that }, true);			
		});
	}	
	
	_remoteParent(parentGuid, packet) {
		
		var dbInfo = this._databases[parentGuid];
		if (!dbInfo) return;
		
		if (dbInfo.type == "remote") {
			var c = dbInfo.controllerInfo.connector;
			return c._remoteParent(dbInfo.controllerInfo.guid, parentGuid, packet);
		}	
		
		if (dbInfo.type == "local") {
			return this.getDb(parentGuid)._remoteParent(packet);
		}
	}
	
	_callChild(childGuid,packet) {
		var dbInfo = this._databases[childGuid];
		if (!dbInfo) return;
		
		if (dbInfo.type == "remote") {
			var c = dbInfo.controllerInfo.connector;
			return c._callChild(dbInfo.controllerInfo.guid, childGuid, packet);
		}	
		
		if (dbInfo.type == "local") {
			return this.getDb(childGuid)._execChild(packet);
		}
		//var db = this._findDb(childGuid);
		//return db._execChild(packet);
	}

}
