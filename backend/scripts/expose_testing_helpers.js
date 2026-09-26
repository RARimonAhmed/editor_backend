import fs from 'fs';

// 1. In secure_token_storage.dart
const vaultPath = 'd:/Tech/my_editor/lib/infrastructure/auth/secure_token_storage.dart';
let vaultContent = fs.readFileSync(vaultPath, 'utf8');
if (!vaultContent.includes('Future<File> getFileForTesting()')) {
  vaultContent = vaultContent.replace(
    'Future<File> _getFile() async {',
    'Future<File> getFileForTesting() => _getFile();\n\n  Future<File> _getFile() async {'
  );
  fs.writeFileSync(vaultPath, vaultContent, 'utf8');
  console.log('Updated secure_token_storage.dart with getFileForTesting');
}

// 2. In auth_interceptor.dart
const interceptorPath = 'd:/Tech/my_editor/lib/infrastructure/auth/auth_interceptor.dart';
let interceptorContent = fs.readFileSync(interceptorPath, 'utf8');
if (!interceptorContent.includes('Future<String> synchronizedRefreshTokenForTesting()')) {
  interceptorContent = interceptorContent.replace(
    'Future<String> _synchronizedRefreshToken() async {',
    'Future<String> synchronizedRefreshTokenForTesting() => _synchronizedRefreshToken();\n\n  Future<String> _synchronizedRefreshToken() async {'
  );
  fs.writeFileSync(interceptorPath, interceptorContent, 'utf8');
  console.log('Updated auth_interceptor.dart with synchronizedRefreshTokenForTesting');
}

// 3. In test/infrastructure/auth_system_test.dart
const testPath = 'd:/Tech/my_editor/test/infrastructure/auth_system_test.dart';
let testContent = fs.readFileSync(testPath, 'utf8');
testContent = testContent.replace('await (storage as dynamic)._getFile();', 'await storage.getFileForTesting();');
testContent = testContent.replace('(interceptor as dynamic)._synchronizedRefreshToken();', 'interceptor.synchronizedRefreshTokenForTesting();');
testContent = testContent.replace('(interceptor as dynamic)._synchronizedRefreshToken();', 'interceptor.synchronizedRefreshTokenForTesting();');
fs.writeFileSync(testPath, testContent, 'utf8');
console.log('Updated auth_system_test.dart');
