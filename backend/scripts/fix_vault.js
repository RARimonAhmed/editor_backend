import fs from 'fs';

const target = 'd:/Tech/my_editor/lib/infrastructure/auth/secure_token_storage.dart';
let content = fs.readFileSync(target, 'utf8');
content = content.replace("final keyMaterial = '$salt_${Platform.localHostname}';", "final keyMaterial = '${salt}_${Platform.localHostname}';");
fs.writeFileSync(target, content, 'utf8');
console.log('Fixed secure_token_storage.dart successfully');
