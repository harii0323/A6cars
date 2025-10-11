import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../widgets/center_hero.dart';

class CarsPage extends StatefulWidget {
  const CarsPage({super.key});

  @override
  State<CarsPage> createState() => _CarsPageState();
}

class _CarsPageState extends State<CarsPage> {
  List<dynamic> cars = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _fetchCars();
  }

  Future<void> _fetchCars() async {
    try {
      final res = await http.get(Uri.parse('http://127.0.0.1:3000/api/cars'));
      if (res.statusCode == 200) {
        final list = List<Map<String,dynamic>>.from(jsonDecode(res.body));
        // batch fetch bookings for all cars
        final ids = list.map((c) => c['id']).toList();
        try {
          final br = await http.post(Uri.parse('http://127.0.0.1:3000/api/bookings/batch'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'car_ids': ids}));
          if (br.statusCode == 200) {
            final map = Map<String, dynamic>.from(jsonDecode(br.body));
            for (final car in list) {
              final bookings = map['${car['id']}'] ?? [];
              final ranges = (bookings as List).map((b) { final s = DateTime.parse(b['start_date']); final e = DateTime.parse(b['end_date']); return {'start': s, 'end': e}; }).toList();
              ranges.sort((a,b) => (a['start'] as DateTime).compareTo(b['start'] as DateTime));
              final merged = <Map<String,DateTime>>[];
              for (final r in ranges) {
                if (merged.isEmpty) { merged.add({'start': r['start'] as DateTime, 'end': r['end'] as DateTime}); continue; }
                final last = merged.last;
                if ((r['start'] as DateTime).isBefore((last['end'] as DateTime).add(const Duration(days:1))) || (r['start'] as DateTime).isAtSameMomentAs((last['end'] as DateTime))) {
                  if ((r['end'] as DateTime).isAfter(last['end'] as DateTime)) last['end'] = r['end'] as DateTime;
                } else {
                  merged.add({'start': r['start'] as DateTime, 'end': r['end'] as DateTime});
                }
              }
              car['booked_ranges'] = merged;
            }
          } else {
            for (final car in list) car['booked_ranges'] = [];
          }
        } catch (e) {
          for (final car in list) car['booked_ranges'] = [];
        }
        setState(() {
          cars = list;
          loading = false;
        });
      } else {
        setState(() => loading = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to load cars')));
      }
    } catch (e) {
      setState(() => loading = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error')));
    }
  }

  Future<void> _bookCar(int carId) async {
    // fetch booked dates for this car
    List<Map<String, dynamic>> bookings = [];
    try {
      final br = await http.get(Uri.parse('http://127.0.0.1:3000/api/bookings/$carId'));
      if (br.statusCode == 200) bookings = List<Map<String, dynamic>>.from(jsonDecode(br.body));
    } catch (e) {
      // ignore and proceed
    }

    // build a set of disabled days
    final disabledDays = <DateTime>{};
    for (final b in bookings) {
      try {
        final startB = DateTime.parse(b['start_date']);
        final endB = DateTime.parse(b['end_date']);
        for (DateTime d = startB; d.isBefore(endB.add(const Duration(days: 1))); d = d.add(const Duration(days: 1))) {
          disabledDays.add(DateTime(d.year, d.month, d.day));
        }
      } catch (e) {}
    }

    final today = DateTime.now();
    final selectableDay = (DateTime day) {
      final key = DateTime(day.year, day.month, day.day);
      // disallow past dates (before today) and disabled booked days
      final isPast = DateTime(day.year, day.month, day.day).isBefore(DateTime(today.year, today.month, today.day));
      if (isPast) return false;
      return !disabledDays.contains(key);
    };

    final start = await showDatePicker(context: context, initialDate: DateTime.now().add(const Duration(days: 1)), firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), selectableDayPredicate: selectableDay);
    if (start == null) return;
    final end = await showDatePicker(context: context, initialDate: start.add(const Duration(days: 1)), firstDate: start.add(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 365)), selectableDayPredicate: selectableDay);
    if (end == null) return;

    try {
  final res = await http.post(Uri.parse('http://127.0.0.1:3000/api/book'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'car_id': carId, 'customer_id': 1, 'start_date': '${start.year}-${start.month.toString().padLeft(2,'0')}-${start.day.toString().padLeft(2,'0')}', 'end_date': '${end.year}-${end.month.toString().padLeft(2,'0')}-${end.day.toString().padLeft(2,'0')}' }));
      if (res.statusCode == 200) {
        final j = jsonDecode(res.body);
        // if bill/payment info present, prompt user to pay
        if (j['bill'] != null && j['payment_id'] != null) {
          final bill = j['bill'];
          final proceed = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
            title: const Text('Payment'),
            content: Text('Days: ${bill['days']}\nDaily Rate: ₹${bill['daily_rate']}\nSubtotal: ₹${bill['subtotal']}\nDiscount: ₹${bill['discount']}\nTotal: ₹${bill['total']}'),
            actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Pay'))],
          ));
          if (proceed == true) {
            final payRes = await http.post(Uri.parse('http://127.0.0.1:3000/api/pay'), headers: {'Content-Type':'application/json'}, body: jsonEncode({'payment_id': j['payment_id']}));
            if (payRes.statusCode == 200) {
              final pj = jsonDecode(payRes.body);
              if (pj['qr_token'] != null) {
                final token = pj['qr_token'];
                final qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + Uri.encodeComponent(token);
                // show QR in dialog
                await showDialog(context: context, builder: (_) => AlertDialog(title: const Text('Payment Successful'), content: Column(mainAxisSize: MainAxisSize.min, children: [const Text('Show this QR at pickup'), Image.network(qrUrl)]), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))]));
              }
            }
          }
        }
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Booked successfully')));
      } else if (res.statusCode == 409) {
        final j = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(j['message'] ?? 'Overlap')));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Booking failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Available Cars')),
      body: SingleChildScrollView(
        child: Column(
          children: [
            CenterHero(title: 'Available Cars', subtitle: 'Choose from our fleet'),
            loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: cars.length,
                    itemBuilder: (context, index) {
                      final car = cars[index];
                      return Card(
                        margin: const EdgeInsets.all(8.0),
                        child: ListTile(
                          title: Text('${car['brand']} ${car['model']}'),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Year: ${car['year']} - ₹${car['daily_rate']} per day'),
                              if (car.containsKey('booked_ranges') && (car['booked_ranges'] as List).isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text('Booked: ' + (car['booked_ranges'] as List).map((r) { final s=r['start'] as DateTime; final e=r['end'] as DateTime; return '${s.day.toString().padLeft(2,'0')}/${s.month.toString().padLeft(2,'0')}/${s.year} - ${e.day.toString().padLeft(2,'0')}/${e.month.toString().padLeft(2,'0')}/${e.year}'; }).join(', '), style: const TextStyle(color: Colors.red, fontSize: 12)),
                              ]
                            ],
                          ),
                          trailing: ElevatedButton(
                            child: const Text('Book'),
                            onPressed: () => _bookCar(car['id']),
                          ),
                        ),
                      );
                    },
                  ),
          ],
        ),
      ),
    );
  }
}
