"""Abuja Area Knowledge Base for the conversational search layer.

Provides factual, pre-authored answers about districts, safety, and development
to power the ask_area_question intent without relying on LLM hallucination.
"""

from __future__ import annotations

import re

# Factual descriptions of key Abuja districts.
DISTRICT_KNOWLEDGE: dict[str, str] = {
    "Maitama": "Maitama is one of Abuja's most exclusive and expensive districts, home to embassies, ministers, and high-net-worth individuals. It is highly secure, very quiet, and features premium infrastructure.",
    "Asokoro": "Asokoro is a premium district known as the haven for top government officials and diplomats. It is heavily guarded, very exclusive, and features luxury real estate, including the ECOWAS secretariat.",
    "Wuse 2": "Wuse 2 is the commercial and entertainment heart of Abuja. It is vibrant, busy, and packed with restaurants, clubs, and offices. It's great for those who want to be close to the action, though it can be noisy and traffic-heavy.",
    "Wuse 1": "Wuse Zone 1 (along with other Wuse zones) is older, more residential, and slightly more affordable than Wuse 2. It offers excellent central access with a mix of old architecture and commercial spots.",
    "Jabi": "Jabi is a rapidly developing upscale district famous for Jabi Lake and Jabi Lake Mall. It has a great mix of residential and commercial properties, and is popular with students due to its proximity to Baze and Nile Universities.",
    "Gwarinpa": "Gwarinpa is the largest single housing estate in West Africa. It is a self-sustaining city within the city, offering a mix of affordable and premium housing, though traffic along the express can be challenging.",
    "Life Camp": "Life Camp is a serene, well-secured district originally developed for construction executives. It remains a quiet, premium residential area with good roads and upscale estates.",
    "Utako": "Utako is a bustling district that serves as a major transport hub. It blends residential estates with commercial activity and offers excellent proximity to the city center and Jabi.",
    "Katampe": "Katampe (and Katampe Extension) is a premium, rocky district offering great views of the city. It is developing quickly as an alternative to Maitama, with luxury estates and good security.",
    "Jahi": "Jahi is a fast-growing, upper-middle-class district located between Gwarinpa and Katampe. It is seeing massive real estate development but some roads are still untarred.",
    "Gudu": "Gudu is a well-established middle-class district known for the Gudu Market. It offers good value for money with easy access to the Central Area.",
    "Lokogoma": "Lokogoma is a vast residential district composed almost entirely of private housing estates. It is highly affordable for middle-class families, though traffic to the city center during rush hour is a major pain point.",
    "Galadimawa": "Galadimawa is an emerging district popular with young professionals and families seeking affordable housing near the city center. Development is ongoing, so infrastructure is mixed.",
    "Lugbe": "Lugbe is a sprawling, highly affordable satellite town along the Airport Road. It is very popular for budget-conscious renters, though it suffers from heavy rush-hour traffic and mixed infrastructure quality.",
    "Kubwa": "Kubwa is one of the oldest and largest satellite towns in Abuja. It is practically a city of its own, offering very affordable housing and its own markets, hospitals, and train station.",
    "Apo": "Apo is a diverse district that ranges from the highly exclusive Apo Legislative Quarters to more affordable surrounding estates. It has excellent infrastructure in its core areas.",
    "Idu": "Idu is Abuja's main industrial layout and home to the train station. Its residential areas are rapidly developing and offer very affordable options, though it feels quite far from the city center.",
    "Central Area": "The Central Business District (CBD) houses the National Mosque, National Christian Centre, and federal ministries. It is mostly commercial, with very few, highly expensive residential options.",
    "Garki": "Garki (Areas 1, 2, 3, etc.) is one of the original districts of Abuja. It is densely populated, very central, and offers a true mix of commercial and residential life.",
}


def get_area_answer(query: str) -> str:
    """Find the best factual answer for an area question based on the query."""
    lower_query = query.lower()
    
    # Try to extract a known district from the query
    matched_districts = []
    for district in DISTRICT_KNOWLEDGE.keys():
        if re.search(rf"\b{re.escape(district.lower())}\b", lower_query):
            matched_districts.append(district)
            
    if not matched_districts:
        return "I don't have specific details on that area right now, but I can help you search for properties there. What's your budget?"
        
    if len(matched_districts) == 1:
        return DISTRICT_KNOWLEDGE[matched_districts[0]]
        
    # If multiple districts mentioned, join them
    answers = [f"**{d}**: {DISTRICT_KNOWLEDGE[d]}" for d in matched_districts]
    return "\n\n".join(answers)
