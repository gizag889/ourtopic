const http = require('http');

async function debugCall() {
  console.log("Sending POST request to http://localhost:3000/api/analyze...");
  const body = JSON.stringify({ topic: "AIの進化" });

  const req = http.request(
    "http://localhost:3000/api/analyze",
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    },
    (res) => {
      console.log(`Status Code: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log("Response Body:");
        try {
           console.log(JSON.stringify(JSON.parse(data), null, 2));
        } catch {
           console.log(data);
        }
      });
    }
  );

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(body);
  req.end();
}

debugCall();
