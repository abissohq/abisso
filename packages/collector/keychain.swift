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
if operation == "installation" || operation == "read_installation" {
    var installationQuery = query
    installationQuery[kSecAttrAccount as String] = "installation"
    var read = installationQuery
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var value: CFTypeRef?
    var status = SecItemCopyMatching(read as CFDictionary, &value)
    if status == errSecItemNotFound && operation == "read_installation" { print("absent"); exit(0) }
    if status == errSecItemNotFound {
        let identifier = UUID().uuidString.lowercased()
        var add = installationQuery
        add[kSecValueData as String] = identifier.data(using: .utf8)!
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(add as CFDictionary, nil)
        guard added == errSecSuccess || added == errSecDuplicateItem else { exit(1) }
        value = nil
        status = SecItemCopyMatching(read as CFDictionary, &value)
    }
    guard status == errSecSuccess, let data = value as? Data,
          let text = String(data: data, encoding: .utf8) else { exit(1) }
    print(text)
} else if operation == "read" {
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
