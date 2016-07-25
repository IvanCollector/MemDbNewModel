'use strict';

class DbPromise {
	constructor(memDb, func, noTran, dbgTech) {

		this._state = "waiting";
		this._noTran = noTran;
		this._tech = dbgTech;

		if (memDb instanceof MemDataBase) {
			this._memDb = memDb;
			// стартовать транзакцию (предполагаем, что НОВУЮ!)
			if (!this._noTran) {
				this._memTran = this._memDb.start();
				if (_dbgTr) console.log("START ",this._memDb._name," ", this._memTran.getTranCount()," ",this._memTran.getGuid());
				
			}
			else
				this._memTran = this._memDb.curTran();
				
		}

		this._num = this._memDb._incPromise(this);


		var that = this;

		var _defResolve = function(res){
				//console.log("RESOLVED ", res, "Promise ", that._num, "tech:", that._noTran);	
				setTimeout(function() {
					//console.log("RESOLVED ", res, "Promise ", that._num, "tech:", that._noTran);
					if (that._resolve) 	
						that._resolve(res,that._memTran); 
					if (!that._noTran) {
						that._memDb.commit();
						if (_dbgTr) console.log("COMMIT ",that._memDb._name," ",that._memTran.getTranCount()," ",that._memTran.getGuid());
					}
					that._state = "resolved";
				},0);
		}
		this._defResolve = _defResolve;

		var _defReject = function(res){
			console.log("REJECTED ", res);
				setTimeout(function() {
					if (that._reject)
						that._reject(res,that._memTran); 
					that._memDb.commit(); // todo заменить на ролбэк?
					that._state = "rejected";
				},0); 
		}
		this._defReject = _defReject;

		func(this._defResolve,this._defReject, this._memTran);
	}


	getResolve() {
		return this._defResolve;
	}

	then(resolve, reject) {
		
		var that = this;

		// создать технический промис и вернуть его наружу (чтобы можно было сделать цепочку .then)
		var techPromise = new DbPromise(this._memDb,function(_resolve,_reject,tr) {
				//console.log("TECH PROMISE CREATED");
				return;
			}, this._noTran, true); //,true);
		
		if (resolve) {
			var wrp = function(res,tran) { // обработчик resolve ЭТОГО промиса
				var r = resolve(res,tran);
				var fres = techPromise.getResolve();

				if (r instanceof DbPromise) {
					r._resolve = function(res, tran) {
						fres(res, tran);
					}
					//r.getResolve(res,tran);
				}
				else { // синхронный обработчик
					techPromise._defResolve(r, tran);
				}
				return "WRAPPER";
			}

			this._resolve = wrp;

		}
		//todo аналогично для reject

		return techPromise;
	}

	getNum(){
		return this._num;
	}
}
