import { describe, expect, it } from "vitest"
import {
  decryptCredentials,
  encryptCredentials,
  generateEncryptionKey,
} from "./credentials"

describe("credential encryption", () => {
  it("encrypts and decrypts roundtrip", async () => {
    const key = await generateEncryptionKey()
    const plaintext = JSON.stringify({ username: "admin", password: "secret" })

    const encrypted = await encryptCredentials(plaintext, key)
    const decrypted = await decryptCredentials(encrypted, key)

    expect(decrypted).toBe(plaintext)
  })

  it("produces different ciphertexts for same input", async () => {
    const key = await generateEncryptionKey()
    const plaintext = "same input"

    const a = await encryptCredentials(plaintext, key)
    const b = await encryptCredentials(plaintext, key)

    expect(a).not.toBe(b)
  })

  it("fails decryption with wrong key", async () => {
    const key1 = await generateEncryptionKey()
    const key2 = await generateEncryptionKey()
    const plaintext = "secret data"

    const encrypted = await encryptCredentials(plaintext, key1)

    await expect(decryptCredentials(encrypted, key2)).rejects.toThrow()
  })

  it("fails decryption with tampered ciphertext", async () => {
    const key = await generateEncryptionKey()
    const encrypted = await encryptCredentials("data", key)

    const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
    bytes[bytes.length - 1] ^= 0xff
    const tampered = btoa(String.fromCharCode(...bytes))

    await expect(decryptCredentials(tampered, key)).rejects.toThrow()
  })

  it("handles empty string", async () => {
    const key = await generateEncryptionKey()
    const encrypted = await encryptCredentials("", key)
    const decrypted = await decryptCredentials(encrypted, key)
    expect(decrypted).toBe("")
  })

  it("handles unicode content", async () => {
    const key = await generateEncryptionKey()
    const plaintext = "пароль: тест 🔐"
    const encrypted = await encryptCredentials(plaintext, key)
    const decrypted = await decryptCredentials(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })
})
