const https = require('https');

const endpoints = [
    '/api/health',
    '/api/setup-db',
    '/api/categories',
    '/api'
];

function testEndpoint(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'faith-masters-6duq-ldzzs84sm-morris-projects-61e630f4.vercel.app',
            port: 443,
            path: path,
            method: 'GET',
            headers: {
                'User-Agent': 'FaithMasters-Test/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({ path, status: res.statusCode, data: response });
                } catch (error) {
                    resolve({ path, status: res.statusCode, data: data.substring(0, 100) });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ path, status: 'ERROR', data: error.message });
        });

        req.end();
    });
}

async function testAllEndpoints() {
    console.log('🔍 Testing available endpoints...\n');
    
    for (const endpoint of endpoints) {
        const result = await testEndpoint(endpoint);
        console.log(`${endpoint}: ${result.status}`);
        if (result.status === 200) {
            console.log(`  ✅ ${JSON.stringify(result.data).substring(0, 100)}...`);
        } else if (result.status === 404) {
            console.log(`  ❌ Not found`);
        } else {
            console.log(`  ⚠️  ${result.data}`);
        }
        console.log('');
    }
}

testAllEndpoints(); 