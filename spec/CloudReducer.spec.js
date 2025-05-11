import {createNodeRequestListener} from "serve-fetch";
import {listenPromise, closePromise} from "../src/utils/node-util.js";
import CloudReducer from "../src/lib/CloudReducer.js";
import http from "http";

describe("CloudReducer",()=>{
	let serviceLog;

	beforeEach(()=>{
		serviceLog=[];
	});

	async function service(request) {
		let data=await request.json();

		if (!data.state) {
			serviceLog.push("starting...");
			return Response.json({state: 1});
		}

		if (data.state==1) {
			serviceLog.push("state is 1, moving to 2");
			return Response.json({state: 2});
		}

		if (data.state==2) {
			serviceLog.push("state is 2, done!");
			return Response.json({state: null});
		}

		throw new Error("unknown state");
	}

	async function errorService(request) {
		throw new Error("Something is wrong...");
	}

	it("can update the current state",async ()=>{
		let serviceServer=http.createServer(createNodeRequestListener(service));
		let port=await listenPromise(serviceServer);

		let cloudReducer=new CloudReducer({
			hookUrl: "http://localhost:"+port+"/"
		});

		await cloudReducer.runBatch();

		expect(serviceLog).toEqual(["starting...","state is 1, moving to 2","state is 2, done!"]);

		await closePromise(serviceServer);
	});

	it("can handle a request",async ()=>{
		let serviceServer=http.createServer(createNodeRequestListener(service));
		let port=await listenPromise(serviceServer);

		let cloudReducer=new CloudReducer({
			hookUrl: "http://localhost:"+port+"/",
			basePathname: "hello/world"
		});

		let statusResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world"));
		let statusResult=await statusResponse.json();
		expect(statusResult.service).toEqual("cloud-reducer");

		let triggerResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world/trigger",{
			method: "POST"
		}));
		let triggerResult=await triggerResponse.json();
		expect(triggerResult).toEqual({success: true});

		statusResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world"));
		statusResult=await statusResponse.json();
		expect(statusResult.runState).toEqual("running");
		expect(statusResult.again).toEqual(false);
		//console.log(statusResult);

		triggerResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world/trigger",{
			method: "POST"
		}));
		triggerResult=await triggerResponse.json();
		expect(triggerResult).toEqual({success: true});

		statusResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world"));
		statusResult=await statusResponse.json();
		//console.log(statusResult);
		expect(statusResult.runState).toEqual("running");
		expect(statusResult.again).toEqual(true);

		while (statusResult.runState=="running") {
			await new Promise(r=>setTimeout(r,100));
			statusResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world"));
			statusResult=await statusResponse.json();
		}

		expect(statusResult.runState).toEqual("idle");
		expect(statusResult.again).toEqual(false);

		await closePromise(serviceServer);

		expect(serviceLog.length).toEqual(6);
	});

	it("handles errors",async ()=>{
		let serviceServer=http.createServer(createNodeRequestListener(errorService));
		let port=await listenPromise(serviceServer);

		let cloudReducer=new CloudReducer({
			hookUrl: "http://localhost:"+port+"/",
			basePathname: "hello/world"
		});

		let triggerResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world/trigger",{
			method: "POST"
		}));
		let triggerResult=await triggerResponse.json();
		expect(triggerResult).toEqual({success: true});

		let statusResult, statusResponse;
		do {
			await new Promise(r=>setTimeout(r,100));
			statusResponse=await cloudReducer.handleRequest(new Request("http:/bla.com/hello/world"));
			statusResult=await statusResponse.json();
		} while (statusResult.runState=="running");

		//console.log(statusResult);
		expect(statusResult.runState).toEqual("error");
		expect(statusResult.error).toEqual("Error: Something is wrong...");

		await closePromise(serviceServer);
	});
});