import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';

import '../../core/network/dio_client.dart';
import '../../domain/ai/copilot/ai_copilot_models.dart';

class AICopilotException implements Exception {
  final String message;
  final int? statusCode;
  final String? code;

  AICopilotException(this.message, {this.statusCode, this.code});

  @override
  String toString() => message;
}

class AICopilotService {
  final Dio _dio;
  final String baseUrl;

  AICopilotService({
    DioClient? client,
    String? baseUrl,
  })  : _dio = client?.dio ?? Dio(),
        baseUrl = baseUrl ??
            const String.fromEnvironment(
              'AI_BACKEND_BASE_URL',
              defaultValue: 'http://127.0.0.1:3000',
            );

  /// Primary API call to backend AI Copilot pipeline
  /// POST /api/v1/ai/copilot
  Future<AICopilotPlan> requestPlan({
    required String projectId,
    required int projectVersion,
    required String prompt,
    String? selectedClipId,
    String? selectedTrackId,
    double playheadPosition = 0.0,
    Map<String, dynamic>? timelineContext,
    String? authToken,
  }) async {
    final payload = {
      'projectId': projectId,
      'projectVersion': projectVersion,
      'prompt': prompt,
      if (selectedClipId != null) 'selectedClipId': selectedClipId,
      if (selectedTrackId != null) 'selectedTrackId': selectedTrackId,
      'playheadPosition': playheadPosition,
      if (timelineContext != null) 'timelineContext': timelineContext,
    };

    final headers = <String, dynamic>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (authToken != null && authToken.isNotEmpty)
        'Authorization': 'Bearer $authToken'
      else
        'x-user-id': 'flutter_editor_user',
    };

    final uri = '$baseUrl/api/v1/ai/copilot';

    try {
      final response = await _dio.post(
        uri,
        data: payload,
        options: Options(
          headers: headers,
          sendTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
        ),
      );

      final data = response.data;
      if (data is Map<String, dynamic> && data['success'] == true && data['data'] != null) {
        return AICopilotPlan.fromMap(data['data'] as Map<String, dynamic>);
      }

      throw AICopilotException(
        data['error']?['message']?.toString() ?? 'Invalid AI Copilot response payload',
        statusCode: response.statusCode,
      );
    } on DioException catch (dioErr) {
      if (dioErr.response != null) {
        final statusCode = dioErr.response?.statusCode;
        final resData = dioErr.response?.data;
        final errorObj = resData is Map<String, dynamic> ? resData['error'] : null;
        final message = errorObj?['message']?.toString() ??
            dioErr.response?.statusMessage ??
            'AI Copilot request failed';

        if (statusCode == 401) {
          throw AICopilotException('Authentication required to access AI Copilot.', statusCode: 401, code: 'UNAUTHORIZED');
        } else if (statusCode == 402 || (message.toLowerCase().contains('credit'))) {
          throw AICopilotException('Insufficient credits for AI Copilot: $message', statusCode: 402, code: 'INSUFFICIENT_CREDITS');
        } else if (statusCode == 400) {
          throw AICopilotException(message, statusCode: 400, code: 'VALIDATION_ERROR');
        } else if (statusCode == 404) {
          throw AICopilotException('Project or resource not found on server.', statusCode: 404, code: 'NOT_FOUND');
        }
        throw AICopilotException('Server error ($statusCode): $message', statusCode: statusCode);
      }

      if (dioErr.type == DioExceptionType.connectionTimeout ||
          dioErr.type == DioExceptionType.receiveTimeout ||
          dioErr.type == DioExceptionType.sendTimeout) {
        throw AICopilotException('AI Copilot request timed out. Please check your connection and retry.', code: 'TIMEOUT');
      }

      // If backend is not currently running locally during offline test, fallback to deterministic engine
      return _generateOfflineFallbackPlan(
        projectId: projectId,
        projectVersion: projectVersion,
        prompt: prompt,
        selectedClipId: selectedClipId,
        selectedTrackId: selectedTrackId,
        playheadPosition: playheadPosition,
        timelineContext: timelineContext,
      );
    } catch (err) {
      if (err is AICopilotException) rethrow;
      throw AICopilotException('Unexpected error generating AI Copilot plan: $err');
    }
  }

  /// Deterministic client-side fallback mirroring backend vocabulary when running completely offline
  AICopilotPlan _generateOfflineFallbackPlan({
    required String projectId,
    required int projectVersion,
    required String prompt,
    String? selectedClipId,
    String? selectedTrackId,
    double playheadPosition = 0.0,
    Map<String, dynamic>? timelineContext,
  }) {
    final raw = prompt.trim().toLowerCase();
    final clipId = selectedClipId ?? 'selected-clip-1';
    final trackId = selectedTrackId ?? 'track-v1';

    String explanation = '';
    final commands = <AICopilotCommand>[];
    double durationDelta = 0.0;

    if (raw.includes('delete') || raw.includes('remove clip')) {
      explanation = 'Delete selected clip from timeline';
      commands.add(AICopilotCommand(
        id: 'cmd-del-1',
        action: AICopilotAction.deleteClip,
        targetClipId: clipId,
        targetTrackId: trackId,
        parameters: {'ripple': raw.includes('ripple')},
        explanation: 'Deletes the currently selected clip.',
        confidence: 0.99,
      ));
      durationDelta = -5.0;
    } else if (raw.includes('smaller') || raw.includes('50%') || raw.includes('scale')) {
      explanation = 'Scale selected clip to 50% of canvas';
      commands.add(AICopilotCommand(
        id: 'cmd-scale-1',
        action: AICopilotAction.setTransform,
        targetClipId: clipId,
        parameters: {
          'scale': 0.5,
          'scaleX': 0.5,
          'scaleY': 0.5,
          'positionX': 0.0,
          'positionY': 0.0,
        },
        explanation: 'Scales down the visual transform of clip $clipId to 0.5x.',
        confidence: 0.98,
      ));
    } else if (raw.includes('fade')) {
      explanation = 'Add a 1.0s fade-in effect to selected clip';
      commands.add(AICopilotCommand(
        id: 'cmd-fade-1',
        action: AICopilotAction.addEffect,
        targetClipId: clipId,
        parameters: {
          'effectType': 'fade_in',
          'duration': 1.0,
          'curve': 'ease_in_out',
        },
        explanation: 'Applies smooth fade-in over 1.0s.',
        confidence: 0.96,
      ));
    } else if (raw.includes('move') || raw.includes('seconds')) {
      explanation = 'Move selected clip 2.0 seconds forward on the timeline';
      commands.add(AICopilotCommand(
        id: 'cmd-move-1',
        action: AICopilotAction.moveClip,
        targetClipId: clipId,
        targetTrackId: trackId,
        parameters: {
          'offsetSeconds': 2.0,
          'direction': 'forward',
        },
        explanation: 'Offsets clip start position by +2.0 seconds.',
        confidence: 0.97,
      ));
    } else if (raw.includes('title') || raw.includes('welcome') || raw.includes('text')) {
      explanation = 'Add text title overlay "Welcome"';
      commands.add(AICopilotCommand(
        id: 'cmd-text-1',
        action: AICopilotAction.addText,
        targetTrackId: 'track-text-1',
        timeRangeStart: playheadPosition,
        timeRangeEnd: playheadPosition + 5.0,
        parameters: {
          'text': 'Welcome',
          'fontSize': 48,
          'fontFamily': 'Inter',
          'color': '#FFFFFF',
          'position': 'center',
        },
        explanation: 'Places title card "Welcome" starting at ${playheadPosition}s.',
        confidence: 0.95,
      ));
    } else if (raw.includes('volume') || raw.includes('music') || raw.includes('audio')) {
      explanation = 'Increase track audio volume';
      commands.add(AICopilotCommand(
        id: 'cmd-audio-1',
        action: AICopilotAction.setAudio,
        targetTrackId: trackId,
        parameters: {
          'volume': 1.2,
          'volumeDelta': 0.2,
        },
        explanation: 'Adjusts audio gain level by +20%.',
        confidence: 0.94,
      ));
    } else {
      explanation = 'Applied AI edit: $prompt';
      commands.add(AICopilotCommand(
        id: 'cmd-gen-1',
        action: AICopilotAction.updateText,
        targetClipId: clipId,
        parameters: {'text': prompt},
        explanation: 'Applied general editor parameter update.',
        confidence: 0.85,
      ));
    }

    return AICopilotPlan(
      planId: 'plan-offline-${DateTime.now().millisecondsSinceEpoch}',
      projectId: projectId,
      projectVersion: projectVersion,
      explanation: explanation,
      commands: commands,
      warnings: const [],
      estimatedImpact: AICopilotImpact(
        affectedTracks: [trackId],
        affectedClips: [clipId],
        durationDelta: durationDelta,
        newEstimatedDuration: 60.0 + durationDelta,
      ),
      createdAt: DateTime.now(),
      status: 'generated',
      provider: 'mock',
      model: 'copilot-intent-rules-v1',
    );
  }
}

extension StringIncludes on String {
  bool includes(String other) => toLowerCase().contains(other.toLowerCase());
}
