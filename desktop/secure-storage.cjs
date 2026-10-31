"use strict";
/** Electron safeStorage on Linux can silently fall back to the reversible
 * "basic_text" backend. Never store API keys or Google OAuth tokens with it.
 * KDE/KWallet and libsecret are acceptable OS credential stores.
 */
const REAL_LINUX_BACKENDS=new Set(["kwallet","kwallet5","kwallet6","gnome_libsecret"]);
function secureStorageAvailable(safeStorage,platform=process.platform){
  try{
    if(!safeStorage || !safeStorage.isEncryptionAvailable())return false;
    if(platform!=="linux")return true;
    if(typeof safeStorage.getSelectedStorageBackend!=="function")return false;
    return REAL_LINUX_BACKENDS.has(safeStorage.getSelectedStorageBackend());
  }catch{return false}
}
function secureStorageRequirement(platform=process.platform){
  return platform==="linux"
    ? "Secure credential storage requires an unlocked KDE KWallet or libsecret keyring. ShowPilot refuses Electron's insecure basic_text fallback. Unlock/configure your wallet, then restart ShowPilot; offline tools remain available."
    : "Secure OS credential storage is unavailable. ShowPilot will not save plaintext credentials.";
}
module.exports={secureStorageAvailable,secureStorageRequirement};
