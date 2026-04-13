# Dépannage - Connexion à la Base de Données

## 🔴 Erreur : `Can't reach database server at localhost:3306`

Cette erreur indique que l'application ne peut pas se connecter à MySQL.

## ✅ Solutions

### 1. Vérifier que MySQL est démarré

**Windows** :
```powershell
# Vérifier si MySQL est en cours d'exécution
Get-Service | Where-Object {$_.Name -like "*mysql*"}

# Démarrer MySQL (si installé comme service)
Start-Service MySQL80
# ou
net start MySQL80
```

**Linux/Mac** :
```bash
# Vérifier le statut
sudo systemctl status mysql
# ou
sudo service mysql status

# Démarrer MySQL
sudo systemctl start mysql
# ou
sudo service mysql start
```

### 2. Vérifier le fichier `.env`

Assurez-vous que votre fichier `.env` contient la bonne configuration :

```env
DATABASE_URL="mysql://username:password@localhost:3306/dodo_vroum_db"
```

**Exemple avec des identifiants réels** :
```env
DATABASE_URL="mysql://root:monmotdepasse@localhost:3306/dodo_vroum_db"
```

### 3. Vérifier que MySQL écoute sur le port 3306

```bash
# Windows PowerShell
netstat -an | findstr :3306

# Linux/Mac
netstat -an | grep 3306
# ou
lsof -i :3306
```

### 4. Tester la connexion manuellement

**Avec MySQL CLI** :
```bash
mysql -u root -p -h localhost -P 3306
```

**Avec Prisma** :
```bash
npx prisma db pull
```

### 5. Utiliser Docker pour MySQL (Alternative)

Si MySQL n'est pas installé localement, vous pouvez utiliser Docker :

```yaml
# docker-compose.mysql.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: dodo_vroum_db
      MYSQL_USER: dodo_user
      MYSQL_PASSWORD: dodo_password
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

Puis dans votre `.env` :
```env
DATABASE_URL="mysql://dodo_user:dodo_password@localhost:3306/dodo_vroum_db"
```

### 6. Vérifier les permissions MySQL

Assurez-vous que l'utilisateur MySQL a les bonnes permissions :

```sql
GRANT ALL PRIVILEGES ON dodo_vroum_db.* TO 'username'@'localhost';
FLUSH PRIVILEGES;
```

### 7. Vérifier le firewall

Sur Windows, vérifiez que le port 3306 n'est pas bloqué par le firewall.

## 🔍 Diagnostic

Pour diagnostiquer le problème, exécutez :

```bash
# Vérifier la configuration Prisma
npx prisma validate

# Tester la connexion
npx prisma db pull

# Voir les logs détaillés
npx prisma db pull --verbose
```

## 📝 Note importante

Une fois MySQL démarré et la connexion établie, vous devrez peut-être exécuter les migrations :

```bash
npx prisma migrate dev
```

Et ensuite peupler la base de données :

```bash
npm run prisma:seed
```

