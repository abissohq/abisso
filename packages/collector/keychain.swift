import Foundation
import Security

let service = "com.abisso.collector.enrollment"
let account = "machine"
let input = FileHandle.standardInput.readDataToEndOfFile()
guard let command = try? JSONSerialization.jsonObject(with: input) as? [String: String],
      let operation = command["operation"] else { exit(1) }
let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                            kSecAttrService as String: service,
                            kSecAttrAccount as String: account,
                            kSecAttrSynchronizable as String: kCFBooleanFalse as Any]
if operation == "read" {
    var read = query
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var value: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &value)
    if status == errSecItemNotFound { print("absent"); exit(0) }
    guard status == errSecSuccess, let data = value as? Data,
          let text = String(data: data, encoding: .utf8) else { exit(1) }
    print(text)
} else if operation == "write", let value = command["value"],
          let data = value.data(using: .utf8) {
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { exit(1) }
    print("stored")
} else { exit(1) }
