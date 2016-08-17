'use strict';

class DbPromise {
	constructor(memDb, func, tech,dbgtech) {
	
		if (!memDb)
			throw new Error("can't startdbpromise");
			
		this._num = memDb._incPromise(this);
		this._state = "waiting";
		this._tech = tech;
		this._dbgtech = dbgtech;

		if (memDb instanceof MemDataBase) {
			this._memDb = memDb;
			this._tran = memDb.getTranGuid();
			this._np = memDb._nportion;
			
			if (!memDb._promises)
				memDb._promises = {};
			if (!this._tech) {
				if (!this._tran) console.log("EMPTY TRAN ",this._num);
				if (!(memDb._promises[this._tran])) {
					memDb._promises[this._tran] = {};
					memDb._promises[this._tran][this._np] = 1;
				}
				else 
					if (!memDb._promises[this._tran][this._np])
						memDb._promises[this._tran][this._np]=1
					else
						memDb._promises[this._tran][this._np]++;		
			}					
		}
		
		var that = this;

		var _defResolve = function(res){
				//console.log("RESOLVED ", res, "Promise ", that._num, "tech:", that._noTran);	
				setTimeout(function() {
					//console.log("RESOLVED ", res, "Promise ", that._num, "tech:", that._noTran);
					if (that._resolve) 	
						that._resolve(res); 

					that._state = "resolved";
					if (!that._tech) {
						that._memDb._promises[that._tran][that._np] --;
						//console.log("PROMISE : ",that._memDb._name,that._tran,that._memDb._promises[that._tran][that._np],"   ",that._dbgtech);
						that._memDb._onResolvePromise(that._memDb._promises[that._tran][that._np],res,that._num, that._tran);
					}
				},0);
		}
		this._defResolve = _defResolve;

		var _defReject = function(res){
			console.log("REJECTED ", res);
				setTimeout(function() {
				/*
					if (that._reject)
						that._reject(res,that._memTran); 
					that._memDb.commit(); // todo заменить на ролбэк?
					*/
					that._state = "rejected";
				},0); 
		}
		this._defReject = _defReject;

		func(this._defResolve,this._defReject);
	}


	getResolve() {
		return this._defResolve;
	}

	then(resolve, reject, tech) {
		
		var that = this;

		// создать технический промис и вернуть его наружу (чтобы можно было сделать цепочку .then)
		var techPromise = new DbPromise(this._memDb,function(_resolve,_reject) {
				//console.log("TECH PROMISE CREATED");
				return;
			}, (tech ? true : this._tech),true); 
		
		if (resolve) {
			var wrp = function(res) { // обработчик resolve ЭТОГО промиса
				var r = resolve(res);
				var fres = techPromise.getResolve();

				if (r instanceof DbPromise) {
					r._resolve = function(res) {
						fres(res);
					}
					//r.getResolve(res,tran);
				}
				else { // синхронный обработчик
					techPromise._defResolve(r);
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
