function readfile(file){
    return new Promise((resolve, reject) => {
        var fr = new FileReader();  
        fr.onload = () => {
            resolve(fr.result )
        };
        fr.readAsArrayBuffer(file);
    });
}

async function encryptfile(objFile, txtEncpassphrase) {
    var plaintextbytes=await readfile(objFile)
    .catch(function(err){
        console.error(err);
    }); 
    var plaintextbytes=new Uint8Array(plaintextbytes);

    var pbkdf2iterations=10000;
    var passphrasebytes=new TextEncoder("utf-8").encode(txtEncpassphrase);
    var pbkdf2salt=window.crypto.getRandomValues(new Uint8Array(8));

    var passphrasekey=await window.crypto.subtle.importKey('raw', passphrasebytes, {name: 'PBKDF2'}, false, ['deriveBits'])
    .catch(function(err){
        console.error(err);
    });
    //console.log('passphrasekey imported');

    var pbkdf2bytes=await window.crypto.subtle.deriveBits({"name": 'PBKDF2', "salt": pbkdf2salt, "iterations": pbkdf2iterations, "hash": 'SHA-256'}, passphrasekey, 384)        
    .catch(function(err){
        console.error(err);
    });
    //console.log('pbkdf2bytes derived');
    pbkdf2bytes=new Uint8Array(pbkdf2bytes);

    keybytes=pbkdf2bytes.slice(0,32);
    ivbytes=pbkdf2bytes.slice(32);

    var key=await window.crypto.subtle.importKey('raw', keybytes, {name: 'AES-CBC', length: 256}, false, ['encrypt']) 
    .catch(function(err){
        console.error(err);
    });
    //console.log('key imported');        

    var cipherbytes=await window.crypto.subtle.encrypt({name: "AES-CBC", iv: ivbytes}, key, plaintextbytes)
    .catch(function(err){
        console.error(err); 
    });

    if(!cipherbytes) {
        return;
    }

    console.log('plaintext encrypted');
    cipherbytes=new Uint8Array(cipherbytes);

    var resultbytes=new Uint8Array(cipherbytes.length+16)
    resultbytes.set(new TextEncoder("utf-8").encode('Salted__'));
    resultbytes.set(pbkdf2salt, 8);
    resultbytes.set(cipherbytes, 16);

    var hashBuffer = await window.crypto.subtle.digest('SHA-256', resultbytes);
    // convert buffer to byte array
    const hashArray = Array.from(new Uint8Array(hashBuffer));  
    // convert bytes to hex string                   
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    var blob = new Blob([resultbytes]);
    var file = new File([blob], objFile.name);

    return [file, hash];
}

async function decryptfile(objFile, txtDecpassphrase) {
    var cipherbytes=await readfile(objFile)
    .catch(function(err){
        console.error(err);
    }); 
    var cipherbytes=new Uint8Array(cipherbytes);

    var pbkdf2iterations=10000;
    var passphrasebytes=new TextEncoder("utf-8").encode(txtDecpassphrase.value);
    var pbkdf2salt=cipherbytes.slice(8,16);


    var passphrasekey=await window.crypto.subtle.importKey('raw', passphrasebytes, {name: 'PBKDF2'}, false, ['deriveBits'])
    .catch(function(err){
        console.error(err);

    });
    console.log('passphrasekey imported');

    var pbkdf2bytes=await window.crypto.subtle.deriveBits({"name": 'PBKDF2', "salt": pbkdf2salt, "iterations": pbkdf2iterations, "hash": 'SHA-256'}, passphrasekey, 384)        
    .catch(function(err){
        console.error(err);
    });
    console.log('pbkdf2bytes derived');
    pbkdf2bytes=new Uint8Array(pbkdf2bytes);

    keybytes=pbkdf2bytes.slice(0,32);
    ivbytes=pbkdf2bytes.slice(32);
    cipherbytes=cipherbytes.slice(16);

    var key=await window.crypto.subtle.importKey('raw', keybytes, {name: 'AES-CBC', length: 256}, false, ['decrypt']) 
    .catch(function(err){
        console.error(err);
    });
    console.log('key imported');        

    var plaintextbytes=await window.crypto.subtle.decrypt({name: "AES-CBC", iv: ivbytes}, key, cipherbytes)
    .catch(function(err){
        console.error(err);
    });

    if(!plaintextbytes) {
        return;
    }

    console.log('ciphertext decrypted');
    plaintextbytes=new Uint8Array(plaintextbytes);

    /*var blob=new Blob([plaintextbytes], {type: 'application/download'});
    var blobUrl=URL.createObjectURL(blob);
    aDecsavefile.href=blobUrl;
    aDecsavefile.download=objFile.name + '.dec';

    spnDecstatus.classList.add("greenspan");
    spnDecstatus.innerHTML='<p>File decrypted.</p>';
    aDecsavefile.hidden=false;*/
}