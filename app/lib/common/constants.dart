final labServerIp = Uri.http('172.20.24.66', '');
final annotationServerIp = Uri.http('10.0.2.2', '');
final annotationServerUrl =
    annotationServerIp.replace(port: 3000, path: 'api/v1');
final labServerUrl = labServerIp.replace(port: 8081, path: 'api/v1');
final keycloakUrl = labServerIp.replace(port: 28080);
final cpicMaxCacheTime = Duration(days: 90);
const cpicLookupUrl =
    'https://api.cpicpgx.org/v1/diplotype?select=genesymbol,diplotype,generesult';
