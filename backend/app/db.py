from datetime import datetime, timezone

from sqlalchemy import false as sa_false
from sqlalchemy import (Boolean, DateTime, ForeignKey, Integer, LargeBinary,
                        PrimaryKeyConstraint, String, Text, create_engine, false)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import DATABASE_URL

_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_args)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(10), default="user")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    # Verificación en dos pasos (TOTP). El secreto va cifrado; los códigos de recuperación, como hashes.
    totp_secret: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    totp_last: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Cuenta creada (o contraseña restablecida) por otra persona: debe elegir su propia contraseña al entrar.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false())
    recovery_codes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Subcuentas de equipo (secretaría, asistentes): trabajan sobre los datos del terapeuta dueño.
    owner_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    # Datos de las personas del equipo para el historial de cambios (documento y firma), cifrados.
    profile: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)


class Subscription(Base):
    """Suscripción del terapeuta (las subcuentas de equipo usan la de su dueño)."""
    __tablename__ = "subscriptions"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan: Mapped[str] = mapped_column(String(10), default="")
    paid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class TrustedDevice(Base):
    """Dispositivo donde ya se verificó el segundo paso. Solo se guarda el hash del token de la cookie."""
    __tablename__ = "trusted_devices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_used: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Record(Base):
    """Un registro (consultante, nota, informe o perfil). El contenido va cifrado."""
    __tablename__ = "records"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    id: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))
    patient_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    payload: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Blob(Base):
    """Archivo adjunto (PDF o imagen), cifrado. Sus datos descriptivos van en un registro «file»."""
    __tablename__ = "blobs"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    id: Mapped[str] = mapped_column(String(64))
    mime: Mapped[str] = mapped_column(String(40))
    size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Verification(Base):
    """Código de verificación de un informe firmado. Solo se guarda el hash del código."""
    __tablename__ = "verifications"
    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    record_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class GoogleLink(Base):
    """Conexión de un usuario con su Google Calendar. El permiso (refresh token) va cifrado."""
    __tablename__ = "google_links"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    token: Mapped[bytes] = mapped_column(LargeBinary)
    calendar_id: Mapped[str] = mapped_column(String(255), default="")
    detail: Mapped[str] = mapped_column(String(12), default="iniciales")
    last_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Feed(Base):
    """Enlace privado de calendario (iCal) de un usuario. Solo se guarda el hash del token."""
    __tablename__ = "calendar_feeds"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    detail: Mapped[str] = mapped_column(String(12), default="iniciales")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Audit(Base):
    """Bitácora de accesos y cambios. Nunca guarda contenido de las sesiones."""
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(String(160), default="")
    patient_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # historia a la que se refiere
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)


class SurveyInvite(Base):
    """Invitación a la encuesta de satisfacción. Se guarda solo el hash del enlace; el contenido va cifrado."""
    __tablename__ = "survey_invites"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    channel: Mapped[str] = mapped_column(String(10), default="manual")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payload: Mapped[bytes] = mapped_column(LargeBinary)


class SurveyResponse(Base):
    """Respuesta a la encuesta, sin vínculo con el consultante ni con la invitación (anónima). Solo el mes."""
    __tablename__ = "survey_responses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    month: Mapped[str] = mapped_column(String(7))
    payload: Mapped[bytes] = mapped_column(LargeBinary)


class SurveyOptOut(Base):
    """Consultantes que pidieron no recibir más encuestas."""
    __tablename__ = "survey_optouts"
    __table_args__ = (PrimaryKeyConstraint("user_id", "patient_id"),)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    patient_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SurveyState(Base):
    """Fecha del último sorteo de cada cuenta."""
    __tablename__ = "survey_state"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    last_draw: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MailAccount(Base):
    """Correo propio de cada terapeuta para enviar sus encuestas. Todo va cifrado (incluida la contraseña)."""
    __tablename__ = "mail_accounts"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    payload: Mapped[bytes] = mapped_column(LargeBinary)


class ApptReminder(Base):
    """Recordatorio de una cita: enlace para confirmar o cancelar (solo se guarda su hash) y cómo se envió."""
    __tablename__ = "appt_reminders"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    appt_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    channel: Mapped[str] = mapped_column(String(10), default="manual")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payload: Mapped[bytes] = mapped_column(LargeBinary)


class ConsentRequest(Base):
    """Consentimiento enviado para firmar a distancia. Del enlace solo se guarda su hash; el texto, el firmante
    y la firma del terapeuta van cifrados. Al firmarse, el consentimiento se agrega a la historia del consultante."""
    __tablename__ = "consent_requests"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # hash del enlace
    ref: Mapped[str] = mapped_column(String(32), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[bytes] = mapped_column(LargeBinary)


class Feedback(Base):
    """Comentario de la versión beta. El texto, el contexto y la captura van cifrados (pueden traer datos sensibles)."""
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    tema: Mapped[str] = mapped_column(String(60))
    tipo: Mapped[str] = mapped_column(String(20))
    estado: Mapped[str] = mapped_column(String(20), default="Nuevo", index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    payload: Mapped[bytes] = mapped_column(LargeBinary)
    image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)


def init_db() -> None:
    from .migrate import migrate  # importación tardía: migrate depende de este módulo
    migrate()
