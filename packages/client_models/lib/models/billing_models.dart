/// Billing, plans, and credit allowance models for TechXayan Creative / my_editor.
library;

class SubscriptionPlan {
  final String id;
  final String name;
  final int priceCents;
  final String interval; // 'month' | 'year'
  final int monthlyCredits;
  final List<String> features;

  const SubscriptionPlan({
    required this.id,
    required this.name,
    required this.priceCents,
    required this.interval,
    required this.monthlyCredits,
    this.features = const [],
  });

  factory SubscriptionPlan.fromJson(Map<String, dynamic> json) {
    return SubscriptionPlan(
      id: json['id'] as String,
      name: json['name'] as String,
      priceCents: json['priceCents'] as int? ?? (json['price'] as int? ?? 0) * 100,
      interval: json['interval'] as String? ?? 'month',
      monthlyCredits: json['monthlyCredits'] as int? ?? 0,
      features: (json['features'] as List<dynamic>?)?.map((f) => f.toString()).toList() ?? [],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'priceCents': priceCents,
        'interval': interval,
        'monthlyCredits': monthlyCredits,
        'features': features,
      };
}

class CreditBalance {
  final int balance;
  final String tier;
  final int monthlyAllowance;
  final int usedThisMonth;

  const CreditBalance({
    required this.balance,
    required this.tier,
    required this.monthlyAllowance,
    this.usedThisMonth = 0,
  });

  factory CreditBalance.fromJson(Map<String, dynamic> json) {
    final data = json['data'] != null ? json['data'] as Map<String, dynamic> : json;
    return CreditBalance(
      balance: data['balance'] as int? ?? (data['creditsBalance'] as int? ?? 0),
      tier: data['tier'] as String? ?? 'free',
      monthlyAllowance: data['monthlyAllowance'] as int? ?? 100,
      usedThisMonth: data['usedThisMonth'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'balance': balance,
        'tier': tier,
        'monthlyAllowance': monthlyAllowance,
        'usedThisMonth': usedThisMonth,
      };
}
