#!/usr/bin/env python3
"""
Tech Veille - RSS Feed Aggregator
Script pour récupérer et parser les flux RSS automatiquement
Compatible avec GitHub Actions

Requirements:
    pip install feedparser requests beautifulsoup4 python-dateutil

Usage:
    python scripts/fetch-feeds.py
"""

import feedparser
import json
import os
import re
from datetime import datetime, timezone
from typing import List, Dict, Optional
from urllib.parse import urlparse
import hashlib

# Configuration
DATA_DIR = 'data'
FEEDS_CONFIG = 'feeds/sources.json'
MAX_ARTICLES_PER_SOURCE = 10
MAX_ARTICLES_PER_NICHE = 100

# Mots-clés pour le scoring par niche
KEYWORDS_SCORING = {
    'ai': {
        'high': ['GPT', 'Claude', 'LLM', 'transformer', 'neural network', 'AGI', 'OpenAI', 'Anthropic'],
        'medium': ['machine learning', 'deep learning', 'AI', 'artificial intelligence', 'model'],
        'low': ['algorithm', 'data', 'prediction', 'automation']
    },
    'security': {
        'high': [
            'zero-day', 'CVE-', 'vulnerability', 'exploit', 'ransomware', 'breach', 
            'RCE', 'XSS', 'SQL injection', 'CSRF', 'XXE', 'SSRF', 'authentication bypass',
            'remote code execution', 'privilege escalation', 'critical vulnerability',
            'security flaw', 'web vulnerability', 'OWASP'
        ],
        'medium': [
            'security', 'malware', 'phishing', 'attack', 'threat', 'patch', 'disclosure',
            'security advisory', 'PoC', 'proof of concept', 'bug bounty', 'penetration test',
            'vulnerability scanner', 'web application security', 'injection'
        ],
        'low': ['cybersecurity', 'protection', 'firewall', 'encryption', 'secure']
    },
    'dev': {
        'high': [
            'Angular 19', 'Angular 18', 'PHP 8.4', 'PHP 8.3', 'Spring Boot 4', 'Spring Boot 3',
            'Laravel 11', 'Symfony 7', 'TypeScript 5', 'React 19',
            'Spring Framework', 'Spring Security', 'Spring Data'
        ],
        'medium': [
            'Angular', 'PHP', 'Spring', 'framework', 'library', 'API', 'performance', 'release',
            'Laravel', 'Symfony', 'Composer', 'dependency injection', 'reactive programming',
            'microservices', 'REST API', 'GraphQL'
        ],
        'low': ['development', 'programming', 'code', 'developer', 'tutorial', 'best practices']
    },
    'finance': {
        'high': ['Bitcoin', 'blockchain', 'DeFi', 'fintech', 'cryptocurrency'],
        'medium': ['payment', 'banking', 'trading', 'investment', 'wallet'],
        'low': ['finance', 'market', 'transaction', 'digital']
    }
}


def generate_article_id(title: str, url: str) -> str:
    """Génère un ID unique pour un article basé sur son titre et URL"""
    unique_string = f"{title}_{url}"
    return hashlib.md5(unique_string.encode()).hexdigest()[:16]


def clean_html(text: str) -> str:
    """Nettoie le HTML et retourne le texte pur"""
    if not text:
        return ""
    
    # Supprime les balises HTML
    clean = re.compile('<.*?>')
    text = re.sub(clean, '', text)
    
    # Supprime les espaces multiples
    text = re.sub(r'\s+', ' ', text)
    
    # Décode les entités HTML
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    
    return text.strip()


def parse_date(date_string: str) -> str:
    """Parse une date et retourne au format ISO"""
    try:
        if not date_string:
            return datetime.now(timezone.utc).isoformat()
        
        # feedparser retourne déjà un tuple de temps
        from time import mktime
        from dateutil import parser
        
        try:
            # Essaie de parser avec feedparser
            parsed = feedparser._parse_date(date_string)
            if parsed:
                dt = datetime.fromtimestamp(mktime(parsed), tz=timezone.utc)
                return dt.isoformat()
        except:
            pass
        
        # Essaie avec dateutil
        dt = parser.parse(date_string)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
        
    except Exception as e:
        print(f"Error parsing date '{date_string}': {e}")
        return datetime.now(timezone.utc).isoformat()


def calculate_relevance_score(article: Dict, niche: str) -> int:
    """
    Calcule un score de pertinence de 0 à 100
    
    Critères:
    - Présence de mots-clés (40 points)
    - Fraîcheur (30 points)
    - Autorité de la source (20 points)
    - Longueur/qualité du contenu (10 points)
    """
    score = 0
    
    title = article.get('title', '').lower()
    description = article.get('description', '').lower()
    content = f"{title} {description}"
    
    # 1. Mots-clés (40 points max)
    keywords = KEYWORDS_SCORING.get(niche, {})
    
    for keyword in keywords.get('high', []):
        if keyword.lower() in content:
            score += 10
    
    for keyword in keywords.get('medium', []):
        if keyword.lower() in content:
            score += 3
    
    for keyword in keywords.get('low', []):
        if keyword.lower() in content:
            score += 1
    
    score = min(score, 40)  # Cap à 40 points
    
    # 2. Fraîcheur (30 points max)
    try:
        published_date = datetime.fromisoformat(article.get('published', ''))
        now = datetime.now(timezone.utc)
        hours_old = (now - published_date).total_seconds() / 3600
        
        if hours_old < 6:
            score += 30
        elif hours_old < 24:
            score += 25
        elif hours_old < 72:
            score += 15
        elif hours_old < 168:  # 1 semaine
            score += 5
    except:
        score += 10  # Score par défaut si erreur de date
    
    # 3. Autorité de la source (20 points max)
    trusted_sources = [
        'techcrunch', 'wired', 'thehackernews', 'bleeping', 'ars technica',
        'mit technology review', 'bloomberg', 'reuters', 'venturebeat',
        'android', 'google', 'microsoft', 'openai', 'anthropic',
        'github', 'spring', 'angular', 'react'
    ]
    
    source = article.get('source', '').lower()
    url = article.get('url', '').lower()
    
    for trusted in trusted_sources:
        if trusted in source or trusted in url:
            score += 20
            break
    else:
        score += 5  # Source inconnue mais existante
    
    # 4. Qualité du contenu (10 points max)
    content_length = len(description)
    
    if content_length > 500:
        score += 10
    elif content_length > 200:
        score += 7
    elif content_length > 100:
        score += 4
    else:
        score += 2
    
    return min(score, 100)


def extract_keywords(article: Dict, niche: str) -> List[str]:
    """Extrait les mots-clés pertinents d'un article"""
    keywords = []
    content = f"{article.get('title', '')} {article.get('description', '')}".lower()
    
    # Utilise les mots-clés définis pour cette niche
    all_keywords = KEYWORDS_SCORING.get(niche, {})
    
    for priority in ['high', 'medium', 'low']:
        for keyword in all_keywords.get(priority, []):
            if keyword.lower() in content:
                keywords.append(keyword)
    
    # Limite à 5 mots-clés
    return list(set(keywords))[:5]


def fetch_feed(feed_url: str, niche: str, source_name: str = None) -> List[Dict]:
    """
    Récupère et parse un flux RSS
    
    Args:
        feed_url: URL du flux RSS
        niche: Niche de l'article (ai, security, dev, finance)
        source_name: Nom personnalisé de la source (optionnel)
    
    Returns:
        Liste des articles parsés
    """
    print(f"  📡 Fetching {feed_url}...")
    
    try:
        # Parse le feed
        feed = feedparser.parse(feed_url)
        
        if feed.bozo:
            print(f"  ⚠️  Warning: Feed may have issues - {feed.bozo_exception}")
        
        articles = []
        
        # Détermine le nom de la source
        if not source_name:
            source_name = feed.feed.get('title', urlparse(feed_url).netloc)
        
        # Parse chaque entrée
        for entry in feed.entries[:MAX_ARTICLES_PER_SOURCE]:
            try:
                # Extrait les données de base
                title = clean_html(entry.get('title', 'Sans titre'))
                description = clean_html(entry.get('summary', entry.get('description', '')))
                url = entry.get('link', '')
                author = entry.get('author', 'Inconnu')
                
                # Parse la date
                published_raw = entry.get('published', entry.get('updated', ''))
                published = parse_date(published_raw)
                
                # Crée l'article
                article = {
                    'id': generate_article_id(title, url),
                    'title': title,
                    'description': description[:500],  # Limite à 500 caractères
                    'url': url,
                    'source': source_name,
                    'author': author,
                    'published': published,
                    'niche': niche,
                    'score': 0,  # Sera calculé après
                    'keywords': []  # Seront extraits après
                }
                
                articles.append(article)
                
            except Exception as e:
                print(f"  ❌ Error parsing entry: {e}")
                continue
        
        print(f"  ✅ Fetched {len(articles)} articles")
        return articles
        
    except Exception as e:
        print(f"  ❌ Error fetching {feed_url}: {e}")
        return []


def process_niche(niche: str, sources: List[Dict]) -> List[Dict]:
    """
    Traite tous les flux RSS d'une niche
    
    Args:
        niche: Nom de la niche
        sources: Liste des sources RSS
    
    Returns:
        Liste des articles agrégés et scorés
    """
    print(f"\n🔄 Processing niche: {niche.upper()}")
    print(f"   Sources: {len(sources)}")
    
    all_articles = []
    
    # Récupère les articles de chaque source
    for source in sources:
        feed_url = source.get('url')
        source_name = source.get('name')
        priority = source.get('priority', 'medium')
        
        if not feed_url:
            continue
        
        articles = fetch_feed(feed_url, niche, source_name)
        
        # Ajuste le score selon la priorité de la source
        priority_multipliers = {
            'high': 1.2,
            'medium': 1.0,
            'low': 0.8
        }
        
        for article in articles:
            article['source_priority'] = priority
            all_articles.append(article)
    
    print(f"\n📊 Processing {len(all_articles)} articles for {niche}...")
    
    # Calcule les scores et extrait les mots-clés
    for article in all_articles:
        article['score'] = calculate_relevance_score(article, niche)
        article['keywords'] = extract_keywords(article, niche)
        
        # Applique le multiplicateur de priorité
        priority = article.pop('source_priority', 'medium')
        multiplier = {'high': 1.2, 'medium': 1.0, 'low': 0.8}.get(priority, 1.0)
        article['score'] = min(int(article['score'] * multiplier), 100)
    
    # Trie par score décroissant
    all_articles.sort(key=lambda x: x['score'], reverse=True)
    
    # Limite au nombre maximum d'articles
    all_articles = all_articles[:MAX_ARTICLES_PER_NICHE]
    
    print(f"✅ Kept top {len(all_articles)} articles (max score: {all_articles[0]['score'] if all_articles else 0})")
    
    return all_articles


def main():
    """Fonction principale"""
    print("=" * 60)
    print("🚀 Tech Veille - RSS Feed Aggregator")
    print("=" * 60)
    
    # Crée le dossier data s'il n'existe pas
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Charge la configuration des sources
    try:
        with open(FEEDS_CONFIG, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: {FEEDS_CONFIG} not found")
        return
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing {FEEDS_CONFIG}: {e}")
        return
    
    # Traite chaque niche
    niches = ['ai', 'security', 'dev', 'php', 'angular', 'spring', 'finance']
    
    for niche in niches:
        # Récupère les sources pour cette niche
        niche_data = config.get(niche, {})
        
        # Cas spéciaux : PHP, Angular, Spring sont dans la section "dev"
        if niche in ['php', 'angular', 'spring'] and not niche_data:
            dev_data = config.get('dev', {})
            if 'subsections' in dev_data:
                # Cherche la sous-section correspondante
                subsection_name = niche if niche != 'spring' else 'spring'
                sources = dev_data['subsections'].get(subsection_name, [])
            else:
                sources = []
        # Gère les sous-sections (comme pour 'dev' et 'security')
        elif 'subsections' in niche_data:
            sources = []
            for subsection_sources in niche_data['subsections'].values():
                sources.extend(subsection_sources)
        else:
            sources = niche_data.get('sources', [])
        
        if not sources:
            print(f"⚠️  No sources found for {niche}")
            continue
        
        # Traite la niche
        articles = process_niche(niche, sources)
        
        # Crée le fichier JSON de sortie
        output = {
            'last_updated': datetime.now(timezone.utc).isoformat(),
            'total_articles': len(articles),
            'articles': articles
        }
        
        output_file = os.path.join(DATA_DIR, f'{niche}_news.json')
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        
        print(f"💾 Saved to {output_file}\n")
    
    print("=" * 60)
    print("✨ Done! All feeds updated successfully")
    print("=" * 60)


if __name__ == '__main__':
    main()