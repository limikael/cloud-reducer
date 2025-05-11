import {urlGetArgs, splitPath, jsonEq, responseAssert} from "../utils/js-util.js";

export default class CloudReducer {
	constructor({fetch, hookUrl, basePathname, authorization, log}) {
		this.hookUrl=hookUrl;
		this.fetch=fetch;
		if (!this.fetch)
			this.fetch=globalThis.fetch.bind(globalThis);

		this.state=null;
		this.basePathname=basePathname;
		if (!this.basePathname)
			this.basePathname="";

		this.baseArgs=splitPath(this.basePathname);
		this.runState="idle";
		this.error=null;
		this.state=null;
		this.again=false;
		this.authorization=authorization;

		this.log=log;
		if (!this.log)
			this.log=()=>{};
	}

	async handleRequest(request) {
		if (this.authorization
				&& request.headers.get("authorization")!=this.authorization)
			return new Response("Forbidden",{status: 403});

		let urlArgs=urlGetArgs(request.url);
		if (!jsonEq(urlArgs.slice(0,this.baseArgs.length),this.baseArgs))
			return;

		urlArgs=urlArgs.slice(this.baseArgs.length);

		if (jsonEq(urlArgs,[])) {
			return Response.json({
				service: "cloud-reducer",
				runState: this.runState,
				error: this.error,
				again: this.again
			});
		}

		if (jsonEq(urlArgs,["trigger"]) && request.method=="POST") {
			this.runBatch();
			return Response.json({success: true});
		}

		else {
			throw new Error("Not found.");
		}
	}

	async reduce() {
		let headers=new Headers({
			"content-type": "application/json"
		});

		if (this.authorization)
			headers.set("authorization",this.authorization);

		this.log("Calling reducer...");
		let response=await this.fetch(this.hookUrl,{
			method: "POST",
			headers: headers,
			body: JSON.stringify({state: this.state})
		});

		await responseAssert(response);

		let result=await response.json();
		if (!result.hasOwnProperty("state"))
			throw new Error("Data from service didn't include state");

		this.state=result.state;
	}

	async runBatch() {
		if (this.runState=="running") {
			this.log("Setting again...");
			this.again=true;
			return;
		}

		try {
			this.runState="running";
			this.error=null;
			this.state=null;
			this.again=false;
			this.log("Starting batch...");

			do {
				await this.reduce();
			} while (this.state);

			this.log("Batch complete.");
			this.runState="idle";
		}

		catch (e) {
			this.log("Batch errored: "+e.message);

			this.runState="error";
			this.error=e.message;
		}

		if (this.again)
			this.runBatch();
	}
}
