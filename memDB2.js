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
		//return rootGuids;
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
				//var res = that._subscribeRootsParentSide(subDb.getGuid(),subDb.getParentGuid(),rootGuids); 
				//accept(res); }, 0);	
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

// todo должна работать асинхронно, но в этом случае ответ от ф-ци (сабскрайб) приходит ДО дельты.		

		//var db = that._databases[dbGuid];
		//var res = db._applyDeltas(deltas);
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
		//for (subs in allSubs) 
		return this._controller._sendDeltas(allSubs); //,allSubs[subs]);

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
		for (var i=0; i<this._log._logCount(); i++) {
			if (this._log._getLogItem(i).type == "s") { // subscription
				d = this.serialize();
				d.add = 1;
				this._log._clear();
				return d;
			}
		}
		this._log._clear();
		return;
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
	}
	
	_logCount() {
		return this._log.length;
	}
	
	_getLogItem(i) {
		return this._log[i];
	}
	
	// добавить в лог подписку базы subDbGuid на рут этого лога
	_addSubscription(subDbGuid) {
		var logElem = {};
		logElem.type = "s";
		logElem.subDbGuid = subDbGuid;
		this._log.push(logElem);
	}
	
	_addModifValue(idx, value) {
		
	}
	
	_clear() {
		this._log = [];
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

/*
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
*/
		
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
	
