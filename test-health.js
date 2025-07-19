const https = require('https');

const options = {
    hostname: 'faith-masters-6duq-ldzzs84sm-morris-projects-61e630f4.vercel.app',
    port: 443,
    path: '/api/health',
    method: 'GET',
    headers: {
        'User-Agent': 'FaithMasters-Test/1.0'
    }
};

console.log('🏥 Testing health endpoint...');

const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            console.log('✅ Health Response:', response);
        } catch (error) {
            console.log('📄 Raw response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
});

req.end(); 