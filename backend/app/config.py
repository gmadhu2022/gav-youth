from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    cors_origins: str = "http://localhost:5173"
    # AI reply suggestions. Set ONE provider's key. Leave both blank to disable.
    # Groq (free, OpenAI-compatible):
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    # Anthropic (Claude):
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5"
    # Web Push (VAPID). Generate with:  npx web-push generate-vapid-keys
    vapid_public_key: str = "BAYrteSEY7sS92lxiB6yhLwAEhUfsnq8-zQw-1a5rSKISG8aK39LqK7cfjr9bxjtfLApJl4AkHEMS7ZdV9oeRiI"
    vapid_private_key: str = "ZkLYKBvlHZitVttjn308_VQisSOoMclWss4RB1nDkqQ"
    vapid_subject: str = "mailto:admin@example.com"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
