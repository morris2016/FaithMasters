const https = require('https');

const options = {
    hostname: 'faith-masters-6duq-ldzzs84sm-morris-projects-61e630f4.vercel.app',
    port: 443,
    path: '/api/setup-db',
    method: 'GET',
    headers: {
        'User-Agent': 'FaithMasters-Setup/1.0'
    }
};

console.log('🚀 Calling database setup endpoint...');

const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            console.log('✅ Response:', response);
            
            if (response.success) {
                console.log('🎉 Database setup completed successfully!');
            } else {
                console.log('❌ Database setup failed:', response.error);
            }
        } catch (error) {
            console.log('📄 Raw response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
});

req.end(); 