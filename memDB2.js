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

	}
	
	addMemDb() {
	}
	
	//subscribeRoot(
	
	
}



class MemDatabase {
	constructor(controller, parentDbGuid) {
		this.controller = controller;
		this.parentDbGuid = parentDbGuid;
		this._dbGuid = guid();
		this.version = 1;
		this.roots = [];
	}
	
	// ��������� �� ���� ������ ����. ���� �������� � ���� ������
	_subscribeRoots(rootGuids, done) {
	}
	
	_unsubscribeRoots(rootGuids, done) {
	}
	
	_addRoot() {
		var r = new RootDb(this);
		this.roots.push(r);
	}
	
	getGuid() {
		return this._dbGuid;
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
		this.db = db;
		this.parentGuid = parentGuid;
		this.data = {};
		if (data) 
			for (var elem in data) this.data[elem] = data[elem];	
		
		if (parentGuid)  
			this.parentVersion = parentVersion;
	}
	
	isMaster() {
		if (this.parentGuid) return false;
		else return true;
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
- ������� ����������
- ������� ������-����
- ������� ������-���� � ����
- ������� ����������� ����
- ������� ����������� ���� � ����

*/

var controller = new MemDbController();		// ������� ���������� ����
var master = new MemDatabase(controller);  	// ������� �������� ����
var chld1_1 = new MemDatabase(controller,master.getGuid());
var chld1_2 = new MemDatabase(controller,master.getGuid());
var chld2_1 = new MemDatabase(controller,chld1_1.getGuid());
var chld2_2 = new MemDatabase(controller,chld1_1.getGuid());

/*
var o = {};
var myobj = new ClientData("VENIK");
var p = Object.getPrototypeOf(myobj);

p.get();
o.x = 1;
*/
//alert(p.clientbu());

//myobj.get();