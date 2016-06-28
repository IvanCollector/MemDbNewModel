'use strict';

function test2() {

	controller = new MemDbController();		// создаем контроллер базы
	master = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу
	chld1 = new MemDataBase(controller,master.getGuid(),{name: "Level1_Db1"});

	var r1,r2,r1_c;

	var userFunc1 = function(resolve,reject, tran) {
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
				var p2 = chld1.run(function(resolve1,reject1,tran) {
					r2 = chld1.addMasterRoot({ 2: 1, 3: 3, 4: 5} , {name: "Level1_Db1_Root1"} ); 
					
					chld1.subscribeRoots([r1.getGuid()]).then(function(res, tran) {
						console.log("Resolve subscribe ",res);
						r1_c = chld1.getRoot(r1.getGuid());
						r1_c.setData(1,12345,tran.getGuid());
					});
					
					resolve1("JOPAS");
				});

				p2.then( function() { resolve("TT"); });
			});
		};

	var sp1 = new Promise(f2)
		.then(function(res) {
			r2._print();
			r1_c._print();
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
var master;
var chld1;

test2();

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

