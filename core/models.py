# core/models.py
from sqlalchemy import Column, Integer, String, Boolean, JSON
from core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Statistiques globales
    games_played = Column(Integer, default=0)
    
    # Cémantix
    cemantix_wins = Column(Integer, default=0)       # Victoires propres
    cemantix_surrenders = Column(Integer, default=0) # Abandons
    
    # Pendu
    hangman_wins = Column(Integer, default=0)
    
    # Daily Challenge
    daily_challenges_validated = Column(Integer, default=0)

    is_admin = Column(Boolean, default=False)

    tycoon_save = Column(JSON, default={})