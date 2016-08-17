'use strict';

var gr1,gr2;
var pdbg, cl;
var n_levels = 4, n_childs = 2;
var r1;
			
function p() {
for (var levels = 0; levels<n_levels; levels++) {
		for (var i=0; i<Math.pow(n_childs,levels); i++) {
			var db = cl[levels][i];
			var cr = db.getRoot(r1.getGuid());
			var x = "";
			if (cr) {
				for (var k=0; k<5; k++) 
					x = x+","+ (cr.getData(k) ? cr.getData(k) : " ");
			}
			console.log(levels,":",i,":",x," : ",db._queue.length," : ",db._curTranGuid);
		}
	}
}

function prt(contr) {
	var dbGuids = contr.getDbGuids();
	for (var i=0; i<dbGuids.length; i++) {
		var curDb = contr.getDb(dbGuids[i]);
		var rootGuids = curDb.getRootGuids();
		console.log("DB "+curDb._name+" "+curDb.getGuid()+"   TRAN:"+curDb.getTranGuid()+"   Queue:"+curDb._queue.length);
		for (var j=0; j<rootGuids.length; j++) {
			var cr = curDb.getRoot(rootGuids[j]);
			var str = rootGuids[j]+" "+cr.getData(0)+" "+cr.getData(1)+" "+cr.getData(2)+" "+cr.getData(3)+" "+cr.getData(4);
			console.log(str);
		}
	}
}

function setItem(db,idx,val) {
	db.run(function() {
		for (var gr in db._roots) {
			db._roots[gr].setData(idx,val,db.getTranGuid());
		}
	}).then(function() { console.log("Done"); });
}

function setPar(db,idx,val) {
	db.run(function() {
		for (var gr in db._roots) {
			var root = db.getRoot(gr);
			if (!root.isMaster())
				db.testSetParElem(db.getRoot(gr),idx,val);
		}
	}).then(function() { console.log("Done setParent"); });
}



function genTest() {
	
	var clevels = [];
	cl=clevels;
	controller = new MemDbController();	
	// создаем дерево баз данных
	for (var levels = 0; levels<n_levels; levels++) {

		if (levels == 0) {
			clevels[0] = [];
			var master = new MemDataBase(controller,undefined,{ name: "MasterBase"});
			clevels[0].push(master); 

			master.run(function() {
				r1 = master.addMasterRoot({1: 1, 2: 2, 3:3 }, { name: "MasterBase_Root1"} );
			});
		}
		else {
			clevels[levels] = [];
			for (var i=0, j=0, k=0; i<n_childs*clevels[levels-1].length; i++) {
				var curParent = clevels[levels-1][k];
				clevels[levels].push( new MemDataBase(controller,curParent.getGuid(),{ name: "Level "+levels+"_"+i})); 
				j++;
				if (j==n_childs) {
				 j=0;
				 k++;
				}
			}
		}
	}

	for (levels = 1; levels<n_levels; levels++) {
		(function() {
			var memlevels = levels;
			setTimeout(function() {
				for (i=0; i<clevels[memlevels].length; i++) {
					var cbase  = clevels[memlevels][i];		
					(function() {
						//console.log("PARENT : ", cbase._name, i, ":",memlevels,i-(n_childs*memlevels-1));
						var memi=i;
						//var memlevels=levels;
						var membase = cbase;
						cbase.run(function() {
							membase.subscribeRoots([r1.getGuid()]).then(function(res) {
								//console.log("Resolve subscribe ",membase._name, memi, ":",memlevels," : ", res);		
							});			
						}).then(function() {
						
							if ((memlevels != n_levels-1) || (memi!=0))
								return;
						
							var dbx = clevels[n_levels-1][0];
							console.log("DBDBDB" , dbx);

							dbx.run(function() {
								//p();
								var rx = dbx.getRoot(r1.getGuid());
								console.log(rx.getData(1)," ",rx.getData(2)," ",rx.getData(3)," ",rx.getData(4));
								rx.setData(4,170,dbx.getTranGuid());
							},"MODIFTRAN").then(function() { 
								console.log("RUN END");
							});	
							
						});
					})();
				}
			},500*levels);
		})();
	}
	
	/*
	setTimeout(function() {
		var dbx = clevels[n_levels-1][0];
		console.log("DBDBDB" , dbx);

		dbx.run(function() {
			p();
			var rx = dbx.getRoot(r1.getGuid());
			console.log(rx.getData(1)," ",rx.getData(2)," ",rx.getData(3)," ",rx.getData(4));
			rx.setData(4,170,dbx.getTranGuid());
		},"MODIFTRAN").then(function() { 
			console.log("RUN END");
		});
	},1500);
	
	*/
	

}


function testCascadeCallbacks() {
	controller = new MemDbController();		// создаем контроллер базы
	master = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу
	chld1 = new MemDataBase(controller,master.getGuid(),{name: "Level1_Db1"});
	chld2 = new MemDataBase(controller,chld1.getGuid(),{name: "Level2_Db1"});
	
	var r1,r2,r3,r1_c,r2_c,r3_c;

	var userFunc1 = function() {
			console.log("INIT MASTER BASE");
			r1 = master.addMasterRoot({1: 34, 2: 99 }, { name: "MasterBase_Root1"} );
			gr1 = r1;
			r1._print();
			r1.setData(1,345,master.getTranGuid());
			
		};

	var p = master.run(userFunc1).then( function() { 
	
	console.log("END");
	
	//setTimeout(function() {
	return chld1.run(function() {
		r2 = chld1.addMasterRoot({ 2: 1, 3: 3, 4: 5} , {name: "Level1_Db1_Root1"} ); 
		chld1.subscribeRoots([r1.getGuid()]).then(function(res) {
				console.log("Resolve subscribe ",res);
				r1_c = chld1.getRoot(r1.getGuid());
				r1_c.setData(4,888,chld1.getTranGuid());
				r1_c.setData(1,100,chld1.getTranGuid());
			});
		}).then( function() { console.log("zzzzzzzzzzz END2"); prt(controller); }); 

	})
	.then( function() { 
	//setTimeout(function() {
	
		chld2.run(function() {
			console.log("START CHILD2");
			r3 = chld2.addMasterRoot({ 2: 11, 3: 31, 4: 51} , {name: "Level2_Db2_Root1"} ); 
			
			chld2.subscribeRoots([r1.getGuid()]).then(function(res) {
				console.log("Resolve subscribe 2 ",res);
				r2_c = chld2.getRoot(r1.getGuid());
				console.log("R1 GUID : ", r1.getGuid());
				r2_c.setData(1,333,chld2.getTranGuid());
				r2_c.setData(0,111,chld2.getTranGuid());
			});
			
		} ).then(function(res) {
			prt(controller);
		});
	
	});
	
}

function test6() {
	controller = new MemDbController();		// создаем контроллер базы
	master = new MemDataBase(controller,undefined,{ name: "MasterBase"});  	// создаем корневую базу
	chld1 = new MemDataBase(controller,master.getGuid(),{name: "Level1_Db1"});
	chld2 = new MemDataBase(controller,chld1.getGuid(),{name: "Level2_Db1"});
	chld2_2 = new MemDataBase(controller,chld1.getGuid(),{name: "Level2_Db2"});

	var r1,r1_1,r2,r3,r1_c,r2_c,r3_c;

	var userFunc1 = function() {
			console.log("INIT MASTER BASE");
			r1 = master.addMasterRoot({1: 34, 2: 99 }, { name: "MasterBase_Root1"} );
			r1_1 = master.addMasterRoot({2: 1, 3: 53 }, { name: "MasterBase_Root2"} );
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
				chld1.subscribeRoots([r1_1.getGuid()]).then(function(res) {
					console.log("Resolve subscribe2 ",res);
					r2_c = chld1.getRoot(r1_1.getGuid());
					r2_c.setData(0,7,chld1.getTranGuid());
					r2_c.setData(1,8,chld1.getTranGuid());				
				});
			});

		}).
		then(function() {	
			chld2.run(function() {
				r3 = chld2.addMasterRoot({ 2: 11, 3: 31, 4: 51} , {name: "Level2_Db2_Root1"} ); 
				
				chld2.subscribeRoots([r1.getGuid()]).then(function(res) {
					console.log("Resolve subscribe 2 ",res);
					r2_c = chld2.getRoot(r1.getGuid());
					console.log("R1 GUID : ", r1.getGuid());
					r2_c.setData(1,333333,chld2.getTranGuid());
					//r2_c.setData(4,111,chld2.curTran().getGuid());
				});
				
			});
		}).then(function() {
			chld2_2.run(function() {						
				chld2_2.subscribeRoots([r1.getGuid()]).then(function(res) {
					r3_c = chld2_2.getRoot(r1.getGuid());
					r3_c.setData(1,131313,chld2_2.getTranGuid());
					r3_c.setData(3,99999,chld2_2.getTranGuid());
				});
			} );		
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
var p1
/*
db.run(function() {

 p1 = new DbPromise(db,function(resolve,reject) {
	resolve();
});
p1.then(function(res) { console.log("OK"); });
});
*/
test6();
//genTest();
//testCascadeCallbacks();

