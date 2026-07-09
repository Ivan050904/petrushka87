def create_transcription_app():
    from transcription.main import create_transcription_app as _create_transcription_app

    return _create_transcription_app()


__all__ = ["create_transcription_app"]
