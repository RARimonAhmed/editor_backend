import fs from 'fs';

const testPath = 'd:/Tech/my_editor/test/integration/live_auth_e2e_test.dart';
let content = fs.readFileSync(testPath, 'utf8');

content = content.replace(
  `      final project = EditorProject.create(
        id: 'offline_proj_1',
        name: 'Offline Masterpiece',
      );

      // Save project offline
      await projectRepository.saveProject(project);

      // Retrieve project offline
      final loaded = await projectRepository.getProject('offline_proj_1');
      expect(loaded, isNotNull);
      expect(loaded!.name, equals('Offline Masterpiece'));

      // List projects offline
      final all = await projectRepository.listProjects();
      expect(all.any((p) => p.id == 'offline_proj_1'), isTrue);`,
  `      final project = EditorProject.initial(
        id: 'offline_proj_1',
        title: 'Offline Masterpiece',
      );

      // Save project offline
      final saveResult = await projectRepository.saveProject(project);
      expect(saveResult.isSuccess, isTrue);

      // Retrieve project offline
      final loadedResult = await projectRepository.getProjectById('offline_proj_1');
      expect(loadedResult.isSuccess, isTrue);
      expect(loadedResult.valueOrNull?.name, equals('Offline Masterpiece'));

      // List projects offline
      final allResult = await projectRepository.listProjects();
      expect(allResult.isSuccess, isTrue);
      expect(allResult.valueOrNull!.any((p) => p.id == 'offline_proj_1'), isTrue);`
);

fs.writeFileSync(testPath, content, 'utf8');
console.log('Fixed live_auth_e2e_test.dart test 6');
