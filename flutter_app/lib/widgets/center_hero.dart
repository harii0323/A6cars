import 'package:flutter/material.dart';

class CenterHero extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? child;

  const CenterHero({super.key, required this.title, this.subtitle, this.child});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16.0, horizontal: 12.0),
      child: Center(
        child: Container(
          width: MediaQuery.of(context).size.width * 0.8,
          padding: const EdgeInsets.all(20.0),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8.0),
            boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 8.0)],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.blue)),
              if (subtitle != null) ...[
                const SizedBox(height: 8),
                Text(subtitle!, style: const TextStyle(color: Colors.grey)),
              ],
              if (child != null) ...[
                const SizedBox(height: 12),
                child!,
              ]
            ],
          ),
        ),
      ),
    );
  }
}
