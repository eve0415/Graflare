const IV_BYTES = 12

export const encryptCredentials = async (
  plaintext: string,
  keyBase64: string,
): Promise<string> => {
  const key = await importKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  )

  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return btoa(String.fromCodePoint(...combined))
}

export const decryptCredentials = async (
  encrypted: string,
  keyBase64: string,
): Promise<string> => {
  const key = await importKey(keyBase64)
  const combined = Uint8Array.from(atob(encrypted), (c) => c.codePointAt(0) ?? 0)

  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  )

  return new TextDecoder().decode(decrypted)
}

const importKey = async (keyBase64: string): Promise<CryptoKey> => {
  const raw = Uint8Array.from(atob(keyBase64), (c) => c.codePointAt(0) ?? 0)
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ])
}

export const generateEncryptionKey = (): Promise<string> => {
  const key = crypto.getRandomValues(new Uint8Array(32))
  return Promise.resolve(btoa(String.fromCodePoint(...key)))
}
