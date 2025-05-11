export function listenPromise(server, ...options) {
	if (!options)
		options=[];

  	return new Promise((resolve, reject) => {
        server.listen(...options,(err) => {
            if (err) {
                reject(err);
            } else {
          	    resolve(server.address().port);
            }
        });
    });
}

export function closePromise(server) {
    return new Promise((resolve,reject)=>{
        server.close(resolve);
    });
}