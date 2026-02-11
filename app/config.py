from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    github_token: str = ""
    github_repo: str = ""
    devin_api_token: str = ""
    database_url: str = "sqlite+aiosqlite:///./app.db"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
