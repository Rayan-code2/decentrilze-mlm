import { Client, Databases } from 'node-appwrite';
import * as fs from 'fs';
import * as path from 'path';

console.log('===================================================');
console.log('        VPS & APPWRITE DIAGNOSTIC UTILITY          ');
console.log('===================================================');

// 1. Read and parse physical .env file
const envPath = path.resolve('.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ ERROR: .env file does not exist in the current directory!');
    console.log('Please make sure you are in the correct directory: cd ~/decentrilze-mlm');
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split(/\r?\n/);

let endpoint = '';
let projectId = '';
let apiKey = '';
let databaseId = '';

let hasCarriageReturn = envContent.includes('\r');
let hasTrailingAngleBracket = false;

for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (key === 'VITE_APPWRITE_ENDPOINT') endpoint = value;
        if (key === 'VITE_APPWRITE_PROJECT_ID') projectId = value;
        if (key === 'APPWRITE_API_KEY') {
            apiKey = value;
            if (value.endsWith('>')) {
                hasTrailingAngleBracket = true;
            }
        }
        if (key === 'VITE_APPWRITE_DATABASE_ID') databaseId = value;
    }
}

console.log('\n--- 1. Environemnt File (.env) Analysis ---');
console.log(`Endpoint:     ${endpoint || '❌ NOT SET'}`);
console.log(`Project ID:   ${projectId || '❌ NOT SET'}`);
console.log(`Database ID:  ${databaseId || '❌ NOT SET'}`);

if (apiKey) {
    const visibleStart = apiKey.substring(0, 8);
    const visibleEnd = apiKey.slice(-8);
    console.log(`API Key:      ${visibleStart}...${visibleEnd} (Length: ${apiKey.length} characters)`);
} else {
    console.log('API Key:      ❌ NOT SET');
}

// Check common formatting errors
let recommendedFix = false;
if (hasCarriageReturn) {
    console.log('⚠️ Warning: File uses Windows-style line endings (\\r\\n). This can cause issues on Linux.');
    recommendedFix = true;
}
if (hasTrailingAngleBracket) {
    console.log('❌ Error: Trailing \'>\' detected at the end of your API Key! This usually happens when nano wraps text.');
    recommendedFix = true;
}
if (apiKey && (apiKey.includes(' ') || apiKey.includes('\t'))) {
    console.log('❌ Error: API Key contains spaces or tabs!');
    recommendedFix = true;
}

if (recommendedFix) {
    console.log('\n👉 HOW TO FIX YOUR .env FILE:');
    console.log('Run the following command on your server to automatically clean your .env file:');
    console.log('  sed -i \'s/\\r//g\' .env && sed -i \'s/>$//g\' .env');
} else {
    console.log('✅ .env file formatting looks clean!');
}

// 2. Connectivity check
console.log('\n--- 2. Server Connectivity Test ---');
if (!endpoint) {
    console.error('❌ Cannot test connectivity: VITE_APPWRITE_ENDPOINT is empty.');
} else {
    try {
        console.log(`Connecting to ${endpoint}...`);
        const urlObj = new URL(endpoint);
        
        // Use standard dynamic fetch since it is Node
        const response = await fetch(`${urlObj.origin}/v1/health`, { method: 'GET' });
        if (response.ok) {
            const health = await response.json().catch(() => ({}));
            console.log(`✅ Reachable! Server status: OK (Appwrite version: ${health.version || '1.x'})`);
        } else {
            console.log(`⚠️ Server responded with code ${response.status}. It is reachable but might have issue.`);
        }
    } catch (e: any) {
        console.log(`❌ FAILED to connect to endpoint: ${e.message}`);
        console.log('Please check:');
        console.log('1. Is your docker containers fully up? (Run: docker ps)');
        console.log('2. Is there a firewall blocking port 80 or your endpoint?');
    }
}

// 3. SDK authentication check
console.log('\n--- 3. Appwrite SDK Connection and Scope Test ---');
if (endpoint && projectId) {
    try {
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId);
            
        if (apiKey) {
            client.setKey(apiKey);
        }

        const db = new Databases(client);
        console.log('Trying to query database list with current configuration...');
        
        try {
            const result = await db.list(databaseId ? [databaseId] : []);
            console.log('✅ Connection Successful! The API key has valid scopes.');
            console.log(`Total Databases accessible: ${result.total}`);
        } catch (dbErr: any) {
            console.log(`❌ DB Test Failed: ${dbErr.message}`);
            console.log(`Error Code: ${dbErr.code}`);
            
            if (dbErr.code === 404 || dbErr.message?.includes('not found')) {
                console.log('\n💡 Diagnosis: "Project not found" typically means:');
                console.log('1. The Project ID in .env does not match any active project in your console.');
                console.log('2. The Endpoint URL is missing "/" or you hit the wrong server.');
                console.log('3. The API key is corrupted, has hidden characters or belongs to a different project.');
            } else if (dbErr.code === 401 || dbErr.message?.includes('missing scopes')) {
                console.log('\n💡 Diagnosis: The API Key has insufficient scopes.');
                console.log('To fix this, go to Appwrite Console > Overview/Settings > API Keys, edit your API key, and check these boxes:');
                console.log('- databases.read, databases.write');
                console.log('- collections.read, collections.write');
                console.log('- attributes.read, attributes.write');
                console.log('- indexes.read, indexes.write');
                console.log('- documents.read, documents.write');
            }
        }
    } catch (sdkErr: any) {
        console.log(`❌ SDK Initialization error: ${sdkErr.message}`);
    }
}

console.log('\n===================================================');
