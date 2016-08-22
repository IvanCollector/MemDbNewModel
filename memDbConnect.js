'use strict';

class MemDbConnect {

	constructor() {
		this._cGuid = guid();
		this._controllers = {};
	}
	
	getGuid() {
		return this._cGuid;
	}

	hasController(guid) {
		return (this._controllers[guid] ? true : false);
	}
		


}

class MemDbLocalConnect extends MemDbConnect {
	
	regController(controller) {
		this._controllers[controller.getGuid()] = controller;
	}
	
	connect(c1,c2Guid) {
		var that = this;
		return new Promise( function(resolve,reject) {
			var c2 = that._controllers[c2Guid];
			if (!c2)
				throw new Error("can't connect to controller via this connector : "+c2guid);
			if (!that._controllers[c1.getGuid()])
				that.regController(c1);	
			
			c2.connect( { guid: c1.getGuid(), connector: that },true );
			resolve();
			
		});
	}	
	
	_regRemote(rcGuid, cGuid, parentGuid) {
		var that = this;
		return new Promise(function(resolve,reject) {
			var rc = that._controllers[rcGuid];
			rc._addRemoteDb(cGuid,parentGuid);
			resolve();
		});
		
	}
	
	_remoteParent(cGuid, parentGuid, packet) {
		var c = this._controllers[cGuid];
		return c.getDb(parentGuid)._remoteParent(packet);
	}
	
	_callChild(cGuid, childGuid,packet) {
		var c = this._controllers[cGuid];
		return c.getDb(childGuid)._execChild(packet);
	}	


}
