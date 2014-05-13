/* This is the background page for gmail-crypt that communicates between gmail and the extension.
 *
 * Copyright 2011 Sean Colyer, <sean @ colyer . name>
 * This program is licensed under the GNU General Public License Version 2.
 * See included "LICENSE" file for details.
 */

var keyring;

//Grouping all alerts in one place, easy to access. Consider moving .html to a format function, since they are heavily pattern based.
var gCryptAlerts = {
  gCryptAlertDecryptNoMessage : {id: 'gCryptAlertDecryptNoMessage', type: 'error', text: 'No OpenPGP message was found.',
    html: '<div class="alert alert-error" id="gCryptAlertDecryptNoMessage">No OpenPGP message was found.</div>' },
  gCryptUnableVerifySignature: {id: 'gCryptUnableVerifySignature', type: '', text: 'Mymail-Crypt For Gmail was unable to verify this message.',
    html: '<div class="alert" id="gCryptUnableVerifySignature">Mymail-Crypt For Gmail was unable to verify this message.</div>' },
  gCryptAbleVerifySignature: {id: 'gCryptAbleVerifySignature', type: 'success', text: 'Mymail-Crypt For Gmail was able to verify this message.',
    html: '<div class="alert alert-success" id="gCryptUnableVerifySignature">Mymail-Crypt For Gmail was able to verify this message.</div>'},
  gCryptAlertPassword: {id: 'gCryptAlertPassword', type: 'error', text: 'Mymail-Crypt For Gmail was unable to read your key. Is your password correct?',
    html: '<div class="alert alert-error" id="gCryptAlertPassword">Mymail-Crypt For Gmail was unable to read your key. Is your password correct?</div>'},
  gCryptAlertDecrypt: {id: 'gCryptAlertDecrypt', type: 'error', text: 'Mymail-Crypt for Gmail was unable to decrypt this message.',
    html: '<div class="alert alert-error" id="gCryptAlertDecrypt">Mymail-Crypt for Gmail was unable to decrypt this message.</div>'},
  gCryptAlertEncryptNoUser: {id: 'gCryptAlertEncryptNoUser', type: 'error', text: 'Unable to find a key for the given user. Have you inserted their public key?',
    html: '<div class="alert alert-error" id="gCryptAlertEncryptNoUser">Unable to find a key for the given user. Have you inserted their public key?</div>'},
  gCryptAlertEncryptNoPrivateKeys: {id: 'gCryptAlertEncryptNoPrivateKeys', type: 'error', text: 'Unable to find a private key for the given user. Have you inserted yours in the Options page?',
    html: '<div class="alert alert-error" id="gCryptAlertEncryptNoUser">Unable to find a private key for the given user. Have you inserted yours in the Options page?</div>'}
};


function getOption(optionName) {
  var gCryptSettings = openpgp.config.thirdParty;
  if(!gCryptSettings || !gCryptSettings.config){
    return;
  }
  else{
    return gCryptSettings.config[optionName];
  }
}

function getPublicKeys(emails){
  var keys = {};
  var includeMyKey = getOption('includeMyself');
  for(var email in emails){
    try{
      if(emails[email].length>0){
          keys[emails[email]] = openpgp.keyring.getPublicKeyForAddress(emails[email])[0].armored;
      }
      if (includeMyKey) {
        var myKey = openpgp.keyring.getPublicKeysForKeyId(request.myKeyId)[0];
        var myEmail = gCryptUtil.parseUser(myKey.obj.userIds[0].text).userEmail;
        keys[myEmail] = myKey.armored;
      }
    }
    catch(e){

    }
  }
  return keys;
}

function getPublicKey(email) {
  return openpgp.keyring.getPublicKeyForAddress(email);
}

function getMyKeyId(callback){
  if(openpgp.keyring.privateKeys.length > 0) {
    return openpgp.keyring.privateKeys[0].keyId;
  }
}

function getKeys(keyIds, keyringSet) {
  var keys = [];
  keyIds.forEach(function(keyId){
    keys.push(keyringSet.getForId(keyId.toHex(), true));
  });
  return keys;
}

function getPrivateKey(email) {
  return openpgp.keyring.getPrivateKeyForAddress(email);
}


function prepareAndValidatePrivateKey(password) {
  debugger;
  var privKey = keyring.getForAddress();//TODO email
  if(!privKey) {
    return gCryptAlerts.gCryptAlertEncryptNoPrivateKeys;
  }
  if (!privKey.decryptSecretMPIs()) {
    if (!privKey.decryptSecretMPIs(password)) {
      return gCryptAlerts.gCryptAlertPassword;
    }
  }
  return privKey;
}

function prepareAndValidateKeysForRecipients(recipients) {
  if(recipients.email.length === 0){
    return gCryptAlert.gCryptAlertEncryptNoUser;
  }

  var keys = getPublicKeys(recipients.email);

  var responseKeys = Object.keys(keys);
  if(responseKeys.length === 0){
    return gCryptAlerts.gCryptAlertEncryptNoUser;
  }
  //We do the section below because when looking up keys from keyring, they're not necessarily in proper form.
  var publicKeys = [];
  for(var r in responseKeys){
    var recipient = responseKeys[r];
    if(keys[recipient].length === 0) {
      return gCryptAlerts.gCryptAlertEncryptNoUser;
    }
    else{
      publicKeys.push(openpgp.read_publicKey(keys[recipient])[0]);
    }
  }

  return publicKeys;
}

function encryptAndSign(recipients, message, password) {
  var privKey = prepareAndValidatePrivateKey(password);
  if(privKey && privKey.type && privKey.type == "error") {
    return privKey;
  }
  var publicKeys = prepareAndValidateKeysForRecipients(recipients);
  if(publicKeys && publicKeys.type && publicKeys.type == "error") {
    return publicKeys;
  }
  var cipherText = openpgp.write_signed_and_encrypted_message(privKey,publicKeys, message);
  return cipherText;
}

function encrypt(recipients, message) {
  var publicKeys = prepareAndValidateKeysForRecipients(recipients);
  if(publicKeys && publicKeys.type && publicKeys.type == "error") {
    return publicKeys;
  }
  var cipherText = openpgp.write_encrypted_message(publicKeys, message);
  return cipherText;
}

function sign(message, password) {
  var privKey = prepareAndValidatePrivateKey(password);
  if(privKey && privKey.type && privKey.type == "error") {
    return privKey;
  }
  var cipherText = openpgp.write_signed_message(privKey, message);
  return cipherText;
}

function decrypt(senderEmail, msg, password) {
  debugger;
  var errors = [];
  try{
    msg = openpgp.message.readArmored(msg);
  }
  catch (e) {
    errors.push(gCryptAlerts.gCryptAlertDecryptNoMessage);
    return {decrypted: false, status: errors};
  }
  var keyIds = msg.getEncryptionKeyIds();
  var privateKeys = getKeys(keyIds, keyring.privateKeys);
  var publicKeys = keyring.publicKeys.getForAddress(senderEmail);
  for (var r = 0; r < privateKeys.length; r++){
    var key = privateKeys[r];
    if (!key.decryptKeyPacket(keyIds, password)) {
      //TODO this could be generate false positive errors if we privateKeys really has multiple hits
      errors.push(gCryptAlerts.gCryptAlertPassword);
    }

    var result = openpgp.decryptAndVerifyMessage(key, publicKeys, msg);

    if (result !== null) {
      var status = [];
      for (var s = 0; s < result.signatures.length; s++) {
        if (result.signatures[s].valid) {
          status = [gCryptAlerts.gCryptAbleVerifySignature];
        }
      }
      if (status.length === 0) {
        status = [gcryptAlerts.gCryptUnableVerifySignature];
      }
      return {decrypted: true, status: status, result: result};
    }
  }
  return {decrypted: false, status: errors};
}


chrome.extension.onRequest.addListener(function(request,sender,sendResponse){
    var result;
    if(request.method == "encryptAndSign"){
      result = encryptAndSign(request.recipients, request.message, request.password);
      sendResponse(result);
    }
    if(request.method == "encrypt"){
      result = encrypt(request.recipients, request.message);
      sendResponse(result);
    }
    if(request.method == "sign"){
      result = sign(request.message, request.password);
      sendResponse(result);
    }
    if(request.method == "decrypt"){
      result = decrypt(request.senderEmail, request.msg, request.password);
      sendResponse(result);
    }
    if(request.method == "getOption"){
      result = getOption(request.option);
      sendResponse(result);
    }
    if(request.method == "getConfig"){
        sendResponse();
    }
    else{
    }
});

function onLoad(){
  keyring = new openpgp.Keyring();//openpgp.Keyring.localstore());
}

document.onload = onLoad();
