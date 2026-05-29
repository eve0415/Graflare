import { describe, expect, it } from "vitest"
import {
  decryptCredentials,
  encryptCredentials,
  generateEncryptionKey,
} from "./credentials"

// Corrupt the final byte of a base64 payload (0xFF - b never equals b), which
// invalidates the AES-GCM auth tag. Kept out of the test body so the necessary
// branching/coalescing does not trip vitest/no-conditional-in-test.
const tamperBase64 = (base64: string): string => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0)
  const lastIndex = bytes.length - 1
  const tampered = bytes.map((byte, index) =>
    index === lastIndex ? 0xFF - byte : byte,
  )
  return btoa(String.fromCodePoint(...tampered))
}

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

    await expect(decryptCredentials(encrypted, key2)).rejects.toThrow(
      /Decryption failed/,
    )
  })

  it("fails decryption with tampered ciphertext", async () => {
    const key = await generateEncryptionKey()
    const encrypted = await encryptCredentials("data", key)

    const tampered = tamperBase64(encrypted)

    await expect(decryptCredentials(tampered, key)).rejects.toThrow(
      /Decryption failed/,
    )
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
