from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0004_add_avatar_url_to_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="paystack_customer_code",
            field=models.CharField(blank=True, default="", max_length=128, verbose_name="Paystack customer code"),
        ),
        migrations.AddField(
            model_name="user",
            name="paystack_email",
            field=models.EmailField(blank=True, default="", max_length=255, verbose_name="Paystack email"),
        ),
        migrations.AddField(
            model_name="user",
            name="subscription_expires_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="subscription expires at"),
        ),
        migrations.AddField(
            model_name="user",
            name="subscription_plan",
            field=models.CharField(choices=[('free', 'Free'), ('founder-pro', 'Founder Pro'), ('raise-pass', 'Raise Pass')], default='free', max_length=32, verbose_name='subscription plan'),
        ),
        migrations.AddField(
            model_name="user",
            name="subscription_started_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="subscription started at"),
        ),
        migrations.AddField(
            model_name="user",
            name="subscription_status",
            field=models.CharField(choices=[('inactive', 'Inactive'), ('pending', 'Pending'), ('active', 'Active'), ('cancelled', 'Cancelled')], default='inactive', max_length=24, verbose_name='subscription status'),
        ),
    ]
