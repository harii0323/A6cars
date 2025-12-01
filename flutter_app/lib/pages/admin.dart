import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../widgets/center_hero.dart';
import 'qr_scanner.dart';

class AdminPage extends StatefulWidget {
  const AdminPage({super.key});

  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage> {
  final TextEditingController idController = TextEditingController();
  final TextEditingController passController = TextEditingController();
  final TextEditingController brandController = TextEditingController();
  final TextEditingController modelController = TextEditingController();
  bool loggedIn = false;
  String qrScanResult = '';
  final GlobalKey qrKey = GlobalKey(debugLabel: 'QR');

  Future<void> _login() async {
    try {
      final res = await http.post(Uri.parse('http://127.0.0.1:3000/api/admin/login'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'id': idController.text, 'password': passController.text}));
      if (res.statusCode == 200) {
        setState(() => loggedIn = true);
      } else {
        final j = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(j['message'] ?? 'Login failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error')));
    }
  }

  Future<void> _addCar() async {
    try {
      final res = await http.post(Uri.parse('http://127.0.0.1:3000/api/addcar'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'brand': brandController.text, 'model': modelController.text, 'year': 2020, 'daily_rate': 1000, 'location': 'Unknown'}));
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Car added')));
      } else {
        final j = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(j['error'] ?? 'Failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error')));
    }
  }

  Future<void> _verifyToken(String token) async {
    try {
      final res = await http.post(Uri.parse('http://127.0.0.1:3000/api/admin/verify-qr'), headers: {'Content-Type':'application/json'}, body: jsonEncode({'qr_token': token}));
      if (res.statusCode == 200) {
        final j = jsonDecode(res.body);
        showDialog(context: context, builder: (_) => AlertDialog(title: const Text('Verified'), content: Text('Booking: ${j['booking']['id']}\nCustomer: ${j['customer']['name']}\nCar: ${j['car']['brand']} ${j['car']['model']}\nAmount: ₹${j['amount']}'), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))]));
      } else {
        final j = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(j['message'] ?? 'Verify failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin')),
      body: SingleChildScrollView(
        child: Column(
          children: [
            CenterHero(
              title: 'Admin Panel',
              subtitle: loggedIn ? 'Add new cars' : 'Login as admin',
              child: loggedIn
                  ? Column(
                      children: [
                        TextField(controller: brandController, decoration: const InputDecoration(labelText: 'Brand')),
                        TextField(controller: modelController, decoration: const InputDecoration(labelText: 'Model')),
                        const SizedBox(height: 10),
                        ElevatedButton(onPressed: _addCar, child: const Text('Add')),
                        const SizedBox(height: 12),
                        const Text('QR Verification', style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Row(children: [Expanded(child: TextField(onChanged: (v) => qrScanResult = v, decoration: const InputDecoration(labelText: 'Paste token here'))), ElevatedButton(onPressed: () => _verifyToken(qrScanResult), child: const Text('Verify'))]),
                        const SizedBox(height: 8),
                        ElevatedButton(onPressed: () async {
                          // open scanner page
                          final result = await Navigator.push(context, MaterialPageRoute(builder: (_) => QRScannerPage()));
                          if (result != null && result is String) {
                            await _verifyToken(result);
                          }
                        }, child: const Text('Scan QR'))
                      ],
                    )
                  : Column(
                      children: [
                        TextField(controller: idController, decoration: const InputDecoration(labelText: 'Admin ID')),
                        TextField(controller: passController, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
                        const SizedBox(height: 10),
                        ElevatedButton(onPressed: _login, child: const Text('Login'))
                      ],
                    ),
            )
          ],
        ),
      ),
    );
  }
}
