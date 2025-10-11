import 'package:flutter/material.dart';

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../widgets/center_hero.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();

  void _register() async {
    final name = nameController.text;
    final email = emailController.text;
    final phone = phoneController.text;
    final password = passwordController.text;
    try {
      final res = await http.post(Uri.parse('http://127.0.0.1:3000/api/register'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'name': name, 'email': email, 'phone': phone, 'password': password}));
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Registered')));
        Navigator.pop(context);
      } else {
        final j = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(j['error'] ?? 'Registration failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Register')),
      body: SingleChildScrollView(
        child: Column(
          children: [
            const SizedBox(height: 12),
            CenterHero(
              title: 'Create Account',
              subtitle: 'Register to start booking cars',
              child: Column(
                children: [
                  TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Name')),
                  TextField(controller: emailController, decoration: const InputDecoration(labelText: 'Email')),
                  TextField(controller: phoneController, decoration: const InputDecoration(labelText: 'Phone')),
                  TextField(controller: passwordController, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: _register, child: const Text('Register')),
                ],
              ),
            )
          ],
        ),
      ),
    );
  }
}
