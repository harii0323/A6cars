import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'register.dart';
import 'cars.dart';
import '../widgets/center_hero.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  bool loading = false;

  void _login() async {
    setState(() => loading = true);
    final email = emailController.text;
    final password = passwordController.text;
    try {
      final res = await http.post(Uri.parse('http://127.0.0.1:3000/api/login'),
          headers: {'Content-Type': 'application/json'}, body: jsonEncode({'email': email, 'password': password}));
      if (res.statusCode == 200) {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const CarsPage()));
      } else {
        final j = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(j['message'] ?? 'Login failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error')));
    } finally {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: SingleChildScrollView(
        child: Column(
          children: [
            const SizedBox(height: 12),
            CenterHero(
              title: 'Welcome Back',
              subtitle: 'Login to manage your bookings',
              child: Column(
                children: [
                  TextField(
                    controller: emailController,
                    decoration: const InputDecoration(labelText: 'Email'),
                  ),
                  TextField(
                    controller: passwordController,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password'),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: loading ? null : _login, child: loading ? const CircularProgressIndicator() : const Text('Login')),
                  TextButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (context) => const RegisterPage()),
                        );
                      },
                      child: const Text('Register'))
                ],
              ),
            )
          ],
        ),
      ),
    );
  }
}
