/**
 * Version actuelle du "Contrat de partenariat propriétaire" que le serveur fait
 * signer (électroniquement) à l'auto-inscription. Ne JAMAIS faire confiance à
 * une version envoyée par le client : c'est cette constante qui est stockée en
 * base, le champ éventuel envoyé par le payload ne sert qu'à détecter un
 * décalage (frontend qui affiche une version obsolète du texte).
 */
export const CURRENT_PARTNER_CONTRACT_VERSION = 'v10';
