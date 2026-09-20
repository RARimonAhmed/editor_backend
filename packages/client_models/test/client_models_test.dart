import 'package:test/test.dart';
import 'package:client_models/client_models.dart';

void main() {
  group('Client Models Serialization & Deserialization Tests', () {
    test('User and AuthResponse deserialization', () {
      final json = {
        'user': {
          'id': 'u1',
          'email': 'editor@techxayan.com',
          'role': 'ADMIN',
          'plan': 'pro',
          'creditsBalance': 500,
        },
        'tokens': {
          'accessToken': 'at_xyz',
          'refreshToken': 'rt_xyz',
          'expiresInSeconds': 7200,
        }
      };

      final auth = AuthResponse.fromJson(json);
      expect(auth.user.id, 'u1');
      expect(auth.user.email, 'editor@techxayan.com');
      expect(auth.user.role, 'ADMIN');
      expect(auth.tokens.accessToken, 'at_xyz');
      expect(auth.tokens.expiresInSeconds, 7200);

      final reEncoded = auth.toJson();
      expect(reEncoded['user']['email'], 'editor@techxayan.com');
    });

    test('Project and CanvasConfig deserialization', () {
      final json = {
        'id': 'p1',
        'title': 'Test Project',
        'version': 4,
        'canvas': {
          'resolutionWidth': 1080,
          'resolutionHeight': 1920,
          'framerate': 60.0,
          'aspectRatio': '9:16',
        },
        'timeline': {
          'duration': 45.0,
          'tracks': [
            {
              'id': 't1',
              'type': 'video',
              'name': 'Main Track',
              'clips': [
                {
                  'id': 'c1',
                  'name': 'Intro Clip',
                  'start': 0.0,
                  'duration': 5.0,
                  'speed': 1.0,
                }
              ]
            }
          ]
        },
        'assets': [
          {
            'id': 'a1',
            'name': 'intro.mp4',
            'type': 'video',
            'duration': 12.0,
          }
        ]
      };

      final project = Project.fromJson(json);
      expect(project.id, 'p1');
      expect(project.canvas.aspectRatio, '9:16');
      expect(project.timeline.tracks.length, 1);
      expect(project.timeline.tracks.first.clips.length, 1);
      expect(project.timeline.tracks.first.clips.first.duration, 5.0);
      expect(project.assets.first.name, 'intro.mp4');
    });

    test('EditorCommand and EditorCommandPlan deserialization', () {
      final json = {
        'intent': 'Trim silences and reframe',
        'commands': [
          {
            'action': 'DELETE_RANGE',
            'timeRange': {'start': 0.0, 'end': 3.2},
          },
          {
            'action': 'AUTO_REFRAME',
            'parameters': {'targetRatio': '9:16'},
          }
        ],
        'preview': {
          'originalDuration': 60.0,
          'estimatedDuration': 56.8,
          'affectedClipsCount': 1,
          'affectedTracksCount': 1,
          'warnings': [],
        }
      };

      final plan = EditorCommandPlan.fromJson(json);
      expect(plan.commands.length, 2);
      expect(plan.commands.first.parsedAction, EditorAction.deleteRange);
      expect(plan.commands.last.parsedAction, EditorAction.autoReframe);
      expect(plan.preview?.estimatedDuration, 56.8);
    });

    test('RealtimeEvent deserialization', () {
      final json = {
        'id': 'evt_1',
        'type': 'ai_job_progress',
        'channel': 'job:job_123',
        'data': {
          'jobId': 'job_123',
          'progress': 75,
          'status': 'RUNNING',
        },
        'timestamp': '2026-09-20T00:00:00.000Z',
      };

      final evt = RealtimeEvent.fromJson(json);
      expect(evt.type, RealtimeEventType.aiJobProgress);
      expect(evt.channel, 'job:job_123');
      expect(evt.data['progress'], 75);
    });
  });
}
