'use strict';

var gr1,gr2;
var pdbg;


function test6() {
	controller = new MemDbController();		// создаем контроллер базы
	master = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу
	chld1 = new MemDataBase(controller,master.getGuid(),{name: "Level1_Db1"});
	chld2 = new MemDataBase(controller,chld1.getGuid(),{name: "Level2_Db1"});
	chld2_2 = new MemDataBase(controller,chld1.getGuid(),{name: "Level2_Db2"});

	var r1,r2,r3,r1_c,r2_c,r3_c;

	var userFunc1 = function() {
			console.log("INIT MASTER BASE");
			r1 = master.addMasterRoot({1: 34, 2: 99 }, { name: "MasterBase_Root1"} );
			gr1 = r1;
			r1._print();
			r1.setData(1,345,master.getTranGuid());
			
		};

	var p = master.run(userFunc1);
	
	chld1.run(function() {
		r2 = chld1.addMasterRoot({ 2: 1, 3: 3, 4: 5} , {name: "Level1_Db1_Root1"} ); 
		chld1.subscribeRoots([r1.getGuid()]).then(function(res) {
				console.log("Resolve subscribe ",res);
				r1_c = chld1.getRoot(r1.getGuid());
				r1_c.setData(4,888,chld1.getTranGuid());
				r1_c.setData(1,100,chld1.getTranGuid());
			});
		});
		
	chld2.run(function() {
		r3 = chld2.addMasterRoot({ 2: 11, 3: 31, 4: 51} , {name: "Level2_Db2_Root1"} ); 
		
		chld2.subscribeRoots([r1.getGuid()]).then(function(res) {
			console.log("Resolve subscribe 2 ",res);
			r2_c = chld2.getRoot(r1.getGuid());
			console.log("R1 GUID : ", r1.getGuid());
			r2_c.setData(1,333,chld2.getTranGuid());
			//r2_c.setData(4,111,chld2.curTran().getGuid());
		});
		
	} );
	
	chld2_2.run(function() {						
		chld2_2.subscribeRoots([r1.getGuid()]).then(function(res) {
			master.printInfo();
			chld1.printInfo();
			chld2.printInfo();
			chld2_2.printInfo();
			console.log("********************************* Resolve subscribe 2_2 ",res);
			r3_c = chld2_2.getRoot(r1.getGuid());
			r3_c.setData(1,131313,chld2_2.getTranGuid());
			r3_c.setData(3,99999,chld2_2.getTranGuid());
		});
	} );
	
	chld2_2.run(function() {						
		chld2_2.subscribeRoots([r2.getGuid()]).then(function(res) {
			console.log("********************************* Resolve subscribe 2_2 2",res);
			r3_c = chld2_2.getRoot(r2.getGuid());
			r3_c.setData(1,777,chld2_2.getTranGuid());
			r3_c.setData(3,999,chld2_2.getTranGuid());
		});
	} ).then(function(res) {
			master.printInfo();
			chld1.printInfo();
			chld2.printInfo();
			chld2_2.printInfo();	
	});	
	
}

function test5() {
	controller = new MemDbController();		// создаем контроллер базы
	master = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу
	chld1 = new MemDataBase(controller,master.getGuid(),{name: "Level1_Db1"});
	chld2 = new MemDataBase(controller,chld1.getGuid(),{name: "Level2_Db1"});
	chld2_2 = new MemDataBase(controller,chld1.getGuid(),{name: "Level2_Db2"});
	
	var r1,r2,r3,r1_c,r2_c,r3_c;

	var userFunc1 = function() {
			console.log("INIT MASTER BASE");
			r1 = master.addMasterRoot({1: 34, 2: 99 }, { name: "MasterBase_Root1"} );
			gr1 = r1;
			r1._print();
			r1.setData(1,345,master.getTranGuid());
			
		};

	var p = master.run(userFunc1);
	p.then(function(res) {
		chld1.run(function() {
			r2 = chld1.addMasterRoot({ 2: 1, 3: 3, 4: 5} , {name: "Level1_Db1_Root1"} ); 
			chld1.subscribeRoots([r1.getGuid()]).then(function(res) {
					console.log("Resolve subscribe ",res);
					r1_c = chld1.getRoot(r1.getGuid());
					r1_c.setData(4,888,chld1.getTranGuid());
					r1_c.setData(1,100,chld1.getTranGuid());
				});
			
			})
			
			.then(function(res) {
				return chld2.run(function() {
					r3 = chld2.addMasterRoot({ 2: 11, 3: 31, 4: 51} , {name: "Level2_Db2_Root1"} ); 
					
					chld2.subscribeRoots([r1.getGuid()]).then(function(res) {
						console.log("Resolve subscribe 2 ",res);
						r2_c = chld2.getRoot(r1.getGuid());
						console.log("R1 GUID : ", r1.getGuid());
						r2_c.setData(1,333,chld2.getTranGuid());
						//r2_c.setData(4,111,chld2.curTran().getGuid());
					});
					
				} )
				.then(function(res) {
					return chld2_2.run(function() {
						
						chld2_2.subscribeRoots([r1.getGuid()]).then(function(res) {
							master.printInfo();
							chld1.printInfo();
							chld2.printInfo();
							chld2_2.printInfo();
							console.log("********************************* Resolve subscribe 2_2 ",res);
							r3_c = chld2_2.getRoot(r1.getGuid());
							r3_c.setData(1,131313,chld2_2.getTranGuid());
							r3_c.setData(3,99999,chld2_2.getTranGuid());
						});
						
					} )
					.then(function(res) {
						master.printInfo();
						chld1.printInfo();
						chld2.printInfo();
						chld2_2.printInfo();
					});
				});
			})
			
		
		})	
		;
		
}		


var controller = new MemDbController();		// создаем контроллер базы
var db = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу
var master;
var chld1;
var chld2,chld2_2;

test6();

/*
setTimeout( function() {
	console.log(db);
},500);
*/