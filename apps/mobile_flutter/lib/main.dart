import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  runApp(const ProviderScope(child: SigecApp()));
}

class SigecApp extends ConsumerWidget {
  const SigecApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
        title: 'SIGEC',
        debugShowCheckedModeBanner: false,
        theme: temaSigec(),
        routerConfig: ref.watch(routerProvider),
      );
}
